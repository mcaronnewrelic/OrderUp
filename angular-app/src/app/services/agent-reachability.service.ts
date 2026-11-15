import { Injectable, signal } from '@angular/core';

const DEFAULT_SCRIPT_HOST = 'js-agent.newrelic.com';
const DEFAULT_BEACON_HOST = 'bam.nr-data.net';
const PROBE_TIMEOUT_MS = 8000;

/**
 * Can this browser actually reach New Relic?
 *
 * The browser agent needs two hosts: one to download itself from
 * (js-agent.newrelic.com) and one to send data to (bam.nr-data.net).
 * Ad blockers, Pi-hole and corporate DNS filters commonly block one or
 * both - and the failure is silent: the site works, but that visitor's
 * page views and clicks never arrive, so the Behind-the-scenes queries
 * for browser data come back empty for them.
 *
 * This service probes both hosts once and publishes the ones it could
 * not reach, so the header can say so. It only runs when the agent was
 * injected into the page (so not in unit tests, and not when the server
 * runs without a licence key), and only when asked - the header asks
 * when Behind the scenes is switched on.
 */
@Injectable({ providedIn: 'root' })
export class AgentReachabilityService {
  /** Hosts that could not be reached. Empty while unknown, and when all is well. */
  readonly blockedHosts = signal<string[]>([]);

  private started = false;

  /** Probe once per page load; later calls do nothing. */
  check(): void {
    if (this.started) return;
    if (typeof window === 'undefined' || !window.newrelic) return;
    if (typeof fetch !== 'function') return;
    this.started = true;
    void this.probe();
  }

  private async probe(): Promise<void> {
    const hosts = this.agentHosts();
    const reachable = await Promise.all(hosts.map((host) => this.canReach(host)));
    this.blockedHosts.set(hosts.filter((_, index) => !reachable[index]));
  }

  /**
   * The hosts this page's agent was configured with (they differ by
   * region, e.g. bam.eu01.nr-data.net), falling back to the US defaults.
   */
  private agentHosts(): string[] {
    const info = (window as unknown as { NREUM?: { info?: Record<string, unknown> } })
      .NREUM?.info;
    const scriptHost = hostOf(info?.['agent']) ?? DEFAULT_SCRIPT_HOST;
    const beaconHost = hostOf(info?.['beacon']) ?? DEFAULT_BEACON_HOST;
    return [...new Set([scriptHost, beaconHost])];
  }

  /**
   * A no-cors request resolves (opaquely) for any HTTP answer and rejects
   * only when the request could not be made at all - which is exactly
   * what a DNS block or an ad blocker produces. A slow answer is not a
   * block, so a timeout counts as reachable.
   */
  private async canReach(host: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await fetch(`https://${host}/`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      return true;
    } catch (error) {
      return (error as Error)?.name === 'AbortError';
    } finally {
      clearTimeout(timer);
    }
  }
}

/** "js-agent.newrelic.com/nr-spa-1.2.3.min.js" or "bam.nr-data.net" -> the host. */
function hostOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const host = value.replace(/^https?:\/\//, '').split('/')[0].trim();
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
}
