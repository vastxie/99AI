import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'verifycation' })
export class VerifycationEntity extends BaseEntity {
	@Column({ comment: '用户id' })
	userId: number;

	@Column({ nullable: false, comment: '验证类型' })
	type: number;

	@Column({ nullable: false, comment: '验证码' })
	code: number;

	@Column({ comment: '过期时间' })
	expiresAt: Date;

	@Column({ length: 64, nullable: false, comment: '发送的邮箱' })
	email: string;

	@Column({ default: 0, nullable: false, comment: '是否已经使用了' })
	used: number;
}
