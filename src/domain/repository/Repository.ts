export interface Repository<Entity> {
  readonly id: string;
  execute(entity: Entity): Entity | Promise<Entity>;
}
