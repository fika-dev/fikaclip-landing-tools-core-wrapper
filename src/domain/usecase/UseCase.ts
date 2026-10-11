import type { Repository } from "../repository/Repository";
import {
  type RoutableImplementation,
  type RouteContextProvider,
  RouterRepository,
} from "../repository/RouterRepository";

export type UseCaseRepository<Entity> = Repository<Entity>;

export type RoutedUseCaseDefinition<Entity> = {
  before?: readonly UseCaseRepository<Entity>[];
  implementations: readonly RoutableImplementation<Entity>[];
  after?: readonly UseCaseRepository<Entity>[];
  contextProviders?: readonly RouteContextProvider<Entity>[];
};

export class UseCase<Entity> {
  private readonly definition: RoutedUseCaseDefinition<Entity>;

  constructor(repositories: readonly UseCaseRepository<Entity>[]);
  constructor(definition: RoutedUseCaseDefinition<Entity>);
  constructor(input: readonly UseCaseRepository<Entity>[] | RoutedUseCaseDefinition<Entity>) {
    this.definition = Array.isArray(input)
      ? { before: input, implementations: [] }
      : (input as RoutedUseCaseDefinition<Entity>);
  }

  async execute(entity: Entity): Promise<Entity> {
    let currentEntity = entity;

    for (const repository of this.definition.before ?? []) {
      currentEntity = await repository.execute(currentEntity);
    }

    if (this.definition.implementations.length > 0) {
      currentEntity = await new RouterRepository(
        this.definition.contextProviders ?? [],
        this.definition.implementations,
      ).execute(currentEntity);
    }

    for (const repository of this.definition.after ?? []) {
      currentEntity = await repository.execute(currentEntity);
    }

    return currentEntity;
  }
}
