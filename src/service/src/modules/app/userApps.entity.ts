import { UserStatusEnum } from '../../common/constants/user.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'user_apps' })
export class UserAppsEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '应用ID' })
  appId: number;

  @Column({ comment: '应用分类ID' })
  catId: number;

  @Column({ comment: 'app类型 system/user', default: 'user' })
  appType: string;

  @Column({ comment: '是否公开到公告菜单', default: false })
  public: boolean;

  @Column({ comment: 'app状态 1正常 2审核 3违规', default: 1 })
  status: number;

  @Column({ comment: 'App应用排序、数字越大越靠前', default: 100 })
  order: number;
}
