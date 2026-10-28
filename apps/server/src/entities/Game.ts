export class Game {
    id!: any;
    name!: string;
    key!: string;
    description?: string;
    loginCallbackPath!: string;
    domainWhitelist!: string[];
    status!: "pending" | "approved" | "rejected" | "decommissioned";
    decommissionReason?: string;
    rejectReason?: string;
    createBy!: string;
    createdAt!: Date;
    updatedAt!: Date;
}
