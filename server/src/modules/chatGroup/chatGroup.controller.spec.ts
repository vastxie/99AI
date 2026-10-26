import { ValidationPipe } from '@nestjs/common';
import { ChatGroupController } from './chatGroup.controller';
import { CreateConversationDto } from './dto/createConversation.dto';
import { DeleteConversationDto } from './dto/deleteConversation.dto';
import { UpdateConversationDto } from './dto/updateConversation.dto';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatGroupController', () => {
  let chatGroupService: any;
  let controller: ChatGroupController;
  const req = { user: { id: 7, role: 'user' } } as any;

  beforeEach(() => {
    chatGroupService = {
      queryConversations: jest.fn().mockResolvedValue([]),
      createConversation: jest.fn().mockResolvedValue({ gid: 'g_0123456789abcdefghijklmn' }),
      updateConversation: jest.fn().mockResolvedValue(true),
      softDeleteConversation: jest.fn().mockResolvedValue(true),
    };
    controller = new ChatGroupController(chatGroupService);
  });

  it('always queries real conversations', async () => {
    await expect(controller.query(req)).resolves.toEqual([]);
    expect(chatGroupService.queryConversations).toHaveBeenCalledWith(req.user);
  });

  it('passes conversation settings and the authenticated owner to creation', async () => {
    const body = { title: '新对话' };
    await controller.create(req, body);
    expect(chatGroupService.createConversation).toHaveBeenCalledWith(req.user, body);
  });

  it('routes soft deletion with the authenticated owner', async () => {
    await controller.del(req, { gid: 'g_0123456789abcdefghijklmn' });
    expect(chatGroupService.softDeleteConversation).toHaveBeenCalledWith(
      'g_0123456789abcdefghijklmn',
      req.user,
    );
  });

  it('validates creation, update, and delete payloads', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { title: '新对话' },
        { type: 'body', metatype: CreateConversationDto, data: '' },
      ),
    ).resolves.toMatchObject({ title: '新对话' });
    await expect(
      pipe.transform(
        { removedMode: 'invalid' },
        { type: 'body', metatype: CreateConversationDto, data: '' },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      pipe.transform(
        {
          gid: ' g_0123456789abcdefghijklmn ',
          title: '  Renamed  ',
          isSticky: true,
        },
        { type: 'body', metatype: UpdateConversationDto, data: '' },
      ),
    ).resolves.toEqual({
      gid: 'g_0123456789abcdefghijklmn',
      title: 'Renamed',
      isSticky: true,
    });

    await expect(
      pipe.transform(
        { gid: ' g_0123456789abcdefghijklmn ' },
        { type: 'body', metatype: DeleteConversationDto, data: '' },
      ),
    ).resolves.toEqual({ gid: 'g_0123456789abcdefghijklmn' });
  });
});
