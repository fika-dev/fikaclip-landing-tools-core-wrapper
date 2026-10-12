import type { BrowserCapabilitySnapshot } from "../entity";
import { MediaEngineUnsupportedError } from "./MediaEngineUnsupportedError";
import type { Repository } from "./Repository";

export type MediaRoutingContext = {
  browser?: BrowserCapabilitySnapshot;
};

export type RouteAssessment = {
  supported: boolean;
  score: number;
  reasons?: readonly string[];
};

export interface RouteContextProvider<Entity> {
  collect(entity: Entity): Promise<Partial<MediaRoutingContext>> | Partial<MediaRoutingContext>;
}

export interface RoutableImplementation<Entity> {
  readonly id: symbol;
  readonly name: string;
  readonly repositories: readonly Repository<Entity>[];
  assess(entity: Entity, context: MediaRoutingContext): Promise<RouteAssessment> | RouteAssessment;
}

export class RouterRepository<Entity> implements Repository<Entity> {
  readonly id = "router";

  constructor(
    private readonly contextProviders: readonly RouteContextProvider<Entity>[],
    private readonly candidates: readonly RoutableImplementation<Entity>[],
  ) {}

  async execute(entity: Entity): Promise<Entity> {
    const context = await this.collectContext(entity);
    const assessed = await Promise.all(
      this.candidates.map(async (implementation, order) => ({
        implementation,
        order,
        assessment: await implementation.assess(entity, context),
      })),
    );
    const candidates = assessed
      .filter(({ assessment }) => assessment.supported)
      .sort((left, right) => right.assessment.score - left.assessment.score || left.order - right.order);

    for (const { implementation } of candidates) {
      try {
        let currentEntity = entity;
        for (const repository of implementation.repositories) {
          currentEntity = await repository.execute(currentEntity);
        }
        return currentEntity;
      } catch (error) {
        if (!(error instanceof MediaEngineUnsupportedError)) throw error;
      }
    }

    throw new MediaEngineUnsupportedError("router", "No repository supports this request in the current environment.");
  }

  private async collectContext(entity: Entity): Promise<MediaRoutingContext> {
    const context: MediaRoutingContext = {};

    for (const provider of this.contextProviders) {
      Object.assign(context, await provider.collect(entity));
    }

    return context;
  }
}
