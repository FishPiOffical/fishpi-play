export class Archive {
    id!: any;
    gameKey!: string;
    userId!: string;
    content!: string; // 2MB limit check done in service
    updatedAt!: Date;
}
