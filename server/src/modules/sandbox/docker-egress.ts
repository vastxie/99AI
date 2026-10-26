import Docker = require('dockerode');
import {
  assertContainerPolicy,
  containerFingerprint,
  platformLabels,
  CONTAINER_LABEL,
} from './container-policy';
import { sandboxOwnerKey, SandboxOperationError, SANDBOX_WORKSPACE_SCHEMA } from './sandbox.port';

export interface EgressOptions {
  image: string;
  prefix: string;
  runtime: string;
  allowHosts?: string;
  denyHosts?: string;
}
const GATEWAY = 'com.docker.network.bridge.gateway_mode_ipv4';
const fail = () =>
  new SandboxOperationError(
    '沙箱出口配置不可用或不符合隔离基线；请管理员检查 Docker 28+、代理镜像和网络。',
  );

/** 每会话独立代理；gVisor 首次启动前必须接齐两网，运行后不热插网卡。 */
export class DockerEgress {
  private readonly tasks = new Map<string, Promise<void>>();
  constructor(
    private readonly docker: Docker,
    private readonly options: EgressOptions,
  ) {}
  sessionName(owner: string): string {
    return `${this.options.prefix}s${SANDBOX_WORKSPACE_SCHEMA}-net-${sandboxOwnerKey(owner)}`;
  }
  private outboundName(owner: string): string {
    return `${this.options.prefix}s${SANDBOX_WORKSPACE_SCHEMA}-egress-out-${sandboxOwnerKey(owner)}`;
  }
  private proxyName(owner: string): string {
    return `${this.options.prefix}s${SANDBOX_WORKSPACE_SCHEMA}-egress-${sandboxOwnerKey(owner)}`;
  }
  private labels(owner: string): Record<string, string> {
    return { ...platformLabels(owner, this.options.prefix), [CONTAINER_LABEL]: 'egress' };
  }
  private async serialized<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    sandboxOwnerKey(owner);
    const task = (this.tasks.get(owner) ?? Promise.resolve()).then(operation);
    const settled = task.then(
      () => undefined,
      () => undefined,
    );
    this.tasks.set(owner, settled);
    try {
      return await task;
    } finally {
      if (this.tasks.get(owner) === settled) this.tasks.delete(owner);
    }
  }
  async ensure(owner: string): Promise<{ network: string; proxy: string }> {
    return this.serialized(owner, async () => {
      const version = await this.docker.version();
      const major = Number(version.Version.split('.')[0]);
      const api = version.ApiVersion.split('.').map(Number);
      if (
        !Number.isInteger(major) ||
        major < 28 ||
        api[0] !== 1 ||
        !Number.isInteger(api[1]) ||
        api[1] < 48
      )
        throw fail();
      let created = false;
      try {
        const markCreated = () => {
          created = true;
        };
        await this.ensureNetwork(this.outboundName(owner), owner, false, markCreated);
        await this.ensureNetwork(this.sessionName(owner), owner, true, markCreated);
        const proxy = this.docker.getContainer(this.proxyName(owner));
        try {
          await proxy.inspect();
        } catch (error) {
          if ((error as { statusCode?: number }).statusCode !== 404) throw error;
          await this.docker.createContainer(await this.proxyOptions(owner));
          created = true;
        }
        return await this.routeOwned(owner);
      } catch (error) {
        // Existing resources may belong to a live turn; only undo this new topology.
        if (created) await this.destroyOwned(owner).catch(() => undefined);
        throw error;
      }
    });
  }
  async route(owner: string): Promise<{ network: string; proxy: string }> {
    return this.serialized(owner, () => this.routeOwned(owner));
  }
  private async routeOwned(owner: string): Promise<{ network: string; proxy: string }> {
    const proxy = this.docker.getContainer(this.proxyName(owner));
    await this.verifyOwned(owner);
    if (!(await proxy.inspect()).State.Running) await proxy.start();
    await this.verifyOwned(owner);
    const info = await this.docker.getNetwork(this.sessionName(owner)).inspect();
    const ip = info.Containers?.[(await proxy.inspect()).Id]?.IPv4Address?.split('/')[0];
    if (!ip || !/^\d+\.\d+\.\d+\.\d+$/u.test(ip)) throw fail();
    return { network: this.sessionName(owner), proxy: `http://${ip}:3128` };
  }
  private async ensureNetwork(
    name: string,
    owner: string,
    internal: boolean,
    onCreated: () => void,
  ): Promise<void> {
    try {
      await this.docker.getNetwork(name).inspect();
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
      await this.docker.createNetwork({
        Name: name,
        Driver: 'bridge',
        Internal: internal,
        EnableIPv6: false,
        Labels: this.labels(owner),
        Options: { [GATEWAY]: internal ? 'isolated' : 'nat' },
      });
      onCreated();
    }
    this.assertNetwork(await this.docker.getNetwork(name).inspect(), owner, internal);
  }
  private assertNetwork(info: Docker.NetworkInspectInfo, owner: string, internal: boolean): void {
    if (
      info.Driver !== 'bridge' ||
      info.Internal !== internal ||
      info.EnableIPv6 ||
      Object.entries(this.labels(owner)).some(([key, value]) => info.Labels?.[key] !== value) ||
      info.Options?.[GATEWAY] !== (internal ? 'isolated' : 'nat') ||
      Object.keys(info.Options || {}).some(key => key !== GATEWAY)
    )
      throw fail();
  }
  private async proxyOptions(owner: string): Promise<Docker.ContainerCreateOptions> {
    const image = await this.docker.getImage(this.options.image).inspect();
    if (!/^sha256:[a-f0-9]{64}$/u.test(image.Id)) throw fail();
    const env = new Map((image.Config?.Env || []).map(value => [value.split('=')[0], value]));
    for (const [key, value] of Object.entries({
      EGRESS_ALLOW_HOSTS: this.options.allowHosts || '',
      EGRESS_DENY_HOSTS: this.options.denyHosts || '',
    }))
      env.set(key, `${key}=${value}`);
    const expected: Docker.ContainerCreateOptions = {
      name: this.proxyName(owner),
      Image: image.Id,
      Entrypoint: [],
      Cmd: ['node', '/opt/egress/proxy.mjs'],
      User: '1000:1000',
      WorkingDir: '/opt/egress',
      Env: [...env.values()],
      Labels: this.labels(owner),
      NetworkingConfig: {
        EndpointsConfig: {
          [this.outboundName(owner)]: {},
          [this.sessionName(owner)]: {},
        },
      },
      HostConfig: {
        Runtime: this.options.runtime,
        NetworkMode: this.outboundName(owner),
        Memory: 128 * 1024 ** 2,
        MemorySwap: 128 * 1024 ** 2,
        NanoCpus: 500_000_000,
        PidsLimit: 64,
        CapDrop: ['ALL'],
        ReadonlyRootfs: true,
        Privileged: false,
        Init: true,
        IpcMode: 'private',
        ShmSize: 16 * 1024 ** 2,
        SecurityOpt: ['no-new-privileges'],
        Binds: [],
        Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=16m,nr_inodes=1024' },
        RestartPolicy: { Name: 'no' },
        LogConfig: { Type: 'none', Config: {} },
        AutoRemove: false,
      },
    };
    expected.Labels![`${CONTAINER_LABEL}.fingerprint`] = containerFingerprint(expected);
    return expected;
  }
  private async verifyProxy(proxy: Docker.Container, owner: string): Promise<void> {
    assertContainerPolicy(await proxy.inspect(), await this.proxyOptions(owner), undefined, [
      this.outboundName(owner),
      this.sessionName(owner),
    ]);
  }
  async verify(owner: string): Promise<void> {
    return this.serialized(owner, () => this.verifyOwned(owner));
  }
  private async verifyOwned(owner: string): Promise<void> {
    const proxy = this.docker.getContainer(this.proxyName(owner));
    await this.verifyProxy(proxy, owner);
    const proxyInfo = await proxy.inspect();
    for (const internal of [false, true]) {
      const network = await this.docker
        .getNetwork(internal ? this.sessionName(owner) : this.outboundName(owner))
        .inspect();
      this.assertNetwork(network, owner, internal);
      if (proxyInfo.State.Running && !network.Containers?.[proxyInfo.Id]) throw fail();
      for (const id of Object.keys(network.Containers || {})) {
        if (id === proxyInfo.Id) continue;
        if (!internal) throw fail();
        const container = await this.docker.getContainer(id).inspect();
        if (
          container.Name !==
            `/${this.options.prefix}s${SANDBOX_WORKSPACE_SCHEMA}-${sandboxOwnerKey(owner)}` ||
          Object.entries(platformLabels(owner, this.options.prefix)).some(
            ([key, value]) => container.Config.Labels?.[key] !== value,
          ) ||
          container.HostConfig.Runtime !== this.options.runtime ||
          Object.keys(container.NetworkSettings.Networks || {}).join() !== this.sessionName(owner)
        )
          throw fail();
      }
    }
  }
  async cleanupOrphans(owners: Set<string>): Promise<void> {
    const filters = JSON.stringify({
      label: [
        `${CONTAINER_LABEL}=egress`,
        `${CONTAINER_LABEL}.instance=${this.options.prefix}`,
        `${CONTAINER_LABEL}.schema=${SANDBOX_WORKSPACE_SCHEMA}`,
      ],
    });
    const networks = await this.docker.listNetworks({
      filters,
    });
    const stale = new Set<string>();
    for (const network of networks) {
      const owner = network.Labels?.[`${CONTAINER_LABEL}.owner`];
      if (!owner || ![this.sessionName(owner), this.outboundName(owner)].includes(network.Name))
        throw fail();
      if (!owners.has(owner)) stale.add(owner);
    }
    for (const proxy of await this.docker.listContainers({ all: true, filters })) {
      const owner = proxy.Labels?.[`${CONTAINER_LABEL}.owner`];
      if (!owner || !proxy.Names?.includes(`/${this.proxyName(owner)}`)) throw fail();
      if (!owners.has(owner)) stale.add(owner);
    }
    for (const owner of stale) await this.destroy(owner);
  }
  async stop(owner: string): Promise<void> {
    return this.serialized(owner, async () => {
      const proxy = this.docker.getContainer(this.proxyName(owner));
      try {
        await proxy.inspect();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) return;
        throw error;
      }
      await this.verifyOwned(owner);
      if ((await proxy.inspect()).State.Running) await proxy.stop({ t: 5 });
    });
  }
  async destroy(owner: string): Promise<void> {
    return this.serialized(owner, () => this.destroyOwned(owner));
  }
  async checkRemoval(owner: string, sessionId: string): Promise<void> {
    return this.serialized(owner, () => this.destroyOwned(owner, sessionId));
  }
  private async destroyOwned(owner: string, sessionId?: string): Promise<void> {
    const proxy = this.docker.getContainer(this.proxyName(owner));
    let proxyId: string | undefined;
    try {
      proxyId = (await proxy.inspect()).Id;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
    }
    if (proxyId) await this.verifyProxy(proxy, owner);
    const networks: Docker.Network[] = [];
    // Validate the entire resource set before deleting anything; no foreign endpoint is removed.
    for (const internal of [true, false]) {
      const network = this.docker.getNetwork(
        internal ? this.sessionName(owner) : this.outboundName(owner),
      );
      let info: Docker.NetworkInspectInfo;
      try {
        info = await network.inspect();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) continue;
        throw error;
      }
      this.assertNetwork(info, owner, internal);
      if (
        Object.keys(info.Containers || {}).some(
          id => id !== proxyId && !(internal && id === sessionId),
        )
      )
        throw fail();
      networks.push(network);
    }
    if (sessionId) return;
    if (proxyId) await proxy.remove({ force: true, v: false });
    for (const network of networks) await network.remove();
  }
}
