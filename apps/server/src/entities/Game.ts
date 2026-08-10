import { Entity, ObjectIdColumn, ObjectId, Column } from "typeorm";

@Entity()
export class Game {
    @ObjectIdColumn()
    id!: ObjectId;

    @Column()
    name!: string;

    @Column({ unique: true })
    key!: string;

    @Column()
    description?: string;

    @Column()
    loginCallbackPath!: string;

    @Column("simple-array")
    domainWhitelist!: string[];

    @Column({ default: "pending" })
    status!: "pending" | "approved" | "rejected" | "decommissioned";

    @Column()
    decommissionReason?: string;

    @Column()
    rejectReason?: string;

    @Column()
    createBy!: string;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    createdAt!: Date;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    updatedAt!: Date;
}
