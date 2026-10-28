export class Config {
    id!: any;
    gameKey!: string;
    userId!: string;
    content!: any; // 10KB limit check done in service
    updatedAt!: Date;
}
