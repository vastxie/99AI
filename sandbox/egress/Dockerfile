FROM node:24-bookworm-slim
ARG EGRESS_DNS_SERVERS="1.1.1.1,8.8.8.8"
ENV EGRESS_DNS_SERVERS=${EGRESS_DNS_SERVERS}
WORKDIR /opt/egress
COPY policy.mjs proxy.mjs ./
RUN chmod 0644 /opt/egress/policy.mjs /opt/egress/proxy.mjs
USER 1000:1000
CMD ["node", "/opt/egress/proxy.mjs"]
