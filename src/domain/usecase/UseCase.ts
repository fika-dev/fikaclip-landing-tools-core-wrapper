import type { Repository } from "../repository/Repository";
import { type RoutableRepository, type RouteContextProvider, RouterRepository } from "../repository/RouterRepository";

export type UseCaseRepository<Entity> = Repository<Entity>;

export class UseCase<Entity> {
  constructor(
    private readonly repositories: readonly UseCaseRepository<Entity>[],
    private readonly contextProviders: readonly RouteContextProvider<Entity>[] = [],
  ) {}

  async execute(entity: Entity): Promise<Entity> {
    let currentEntity = entity;

    for (let index = 0; index < this.repositories.length; index += 1) {
      const repository = this.repositories[index];

      if (!isRoutableRepository(repository)) {
        currentEntity = await repository.execute(currentEntity);
        continue;
      }

      const candidates: RoutableRepository<Entity>[] = [repository];
      let nextRepository = this.repositories[index + 1];
      while (isRoutableRepository(nextRepository)) {
        candidates.push(nextRepository);
        index += 1;
        nextRepository = this.repositories[index + 1];
      }

      currentEntity = await new RouterRepository(this.contextProviders, candidates).execute(currentEntity);
    }

    return currentEntity;
  }
}

function isRoutableRepository<Entity>(
  repository: UseCaseRepository<Entity> | undefined,
): repository is RoutableRepository<Entity> {
  return repository !== undefined && "assess" in repository && typeof repository.assess === "function";
}
