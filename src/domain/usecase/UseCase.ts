import type { Repository } from "../repository/Repository";

export type UseCaseRepository<Entity> = Repository<Entity>;

export class UseCase<Entity> {
  constructor(private readonly repositories: Array<UseCaseRepository<Entity>>) {}

  async execute(entity: Entity): Promise<Entity> {
    let currentEntity = entity;

    for (const repository of this.repositories) {
      currentEntity = await repository.execute(currentEntity);
    }

    return currentEntity;
  }
}
