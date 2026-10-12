import type { BrowserCapabilityRepository, MediaRoutingContext, RouteContextProvider } from "../../../domain";

export class BrowserRouteContextProvider<Entity> implements RouteContextProvider<Entity> {
  constructor(private readonly capabilityRepository: BrowserCapabilityRepository) {}

  async collect(): Promise<Partial<MediaRoutingContext>> {
    const capability = await this.capabilityRepository.execute({});
    return { browser: capability.result };
  }
}
