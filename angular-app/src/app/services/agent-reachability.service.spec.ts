import { TestBed } from '@angular/core/testing';
import { AgentReachabilityService } from './agent-reachability.service';

type NreumWindow = { NREUM?: { info?: Record<string, unknown> } };

describe('AgentReachabilityService', () => {
  let service: AgentReachabilityService;
  let fetchSpy: jasmine.Spy;
  let originalAgent: typeof window.newrelic;
  let originalNreum: NreumWindow['NREUM'];

  /** Let the probe's promises settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  /** fetch that fails (as a DNS block or ad blocker does) for the given hosts. */
  function blocking(...hosts: string[]) {
    fetchSpy.and.callFake((url: string) =>
      hosts.some((host) => url.includes(host))
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response(null)),
    );
  }

  beforeEach(() => {
    originalAgent = window.newrelic;
    originalNreum = (window as NreumWindow).NREUM;
    window.newrelic = {}; // the agent was injected into the page
    (window as NreumWindow).NREUM = undefined;
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null));
    service = TestBed.inject(AgentReachabilityService);
  });

  afterEach(() => {
    window.newrelic = originalAgent;
    (window as NreumWindow).NREUM = originalNreum;
  });

  it('reports nothing when both agent hosts answer', async () => {
    service.check();
    await settle();
    expect(service.blockedHosts()).toEqual([]);
    expect(fetchSpy.calls.allArgs().map(([url]) => url)).toEqual([
      'https://js-agent.newrelic.com/',
      'https://bam.nr-data.net/',
    ]);
  });

  it('names the data host when only that one is blocked', async () => {
    blocking('bam.nr-data.net');
    service.check();
    await settle();
    expect(service.blockedHosts()).toEqual(['bam.nr-data.net']);
  });

  it('names both hosts when both are blocked', async () => {
    blocking('js-agent.newrelic.com', 'bam.nr-data.net');
    service.check();
    await settle();
    expect(service.blockedHosts()).toEqual(['js-agent.newrelic.com', 'bam.nr-data.net']);
  });

  it('probes the hosts this page was configured with, not just the US defaults', async () => {
    (window as NreumWindow).NREUM = {
      info: {
        agent: 'js-agent.newrelic.com/nr-spa-1.324.1.min.js',
        beacon: 'bam.eu01.nr-data.net',
      },
    };
    blocking('bam.eu01.nr-data.net');
    service.check();
    await settle();
    expect(service.blockedHosts()).toEqual(['bam.eu01.nr-data.net']);
  });

  it('does not call a slow host blocked', async () => {
    fetchSpy.and.callFake(() =>
      Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    service.check();
    await settle();
    expect(service.blockedHosts()).toEqual([]);
  });

  it('probes only once however often it is asked', async () => {
    service.check();
    service.check();
    await settle();
    service.check();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // one request per host
  });

  it('stays silent when the page has no browser agent at all', async () => {
    window.newrelic = undefined;
    service.check();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(service.blockedHosts()).toEqual([]);
  });
});
