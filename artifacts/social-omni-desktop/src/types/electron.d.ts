export {};

declare global {
  interface BrowserAutomationEvent {
    jobId: string;
    platform: 'WhatsApp' | 'Facebook';
    status: string;
    phase: string;
    message: string;
    level: string;
    at: string;
  }
  interface Window {
    socialOmni?: {
      readonly isDesktop: true;
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
      openPlatform(platform: string): Promise<void>;
      apiRequest(method: string, route: string, body?: unknown): Promise<unknown>;
      startBrowserJob?(body: unknown): Promise<unknown>;
      onBrowserEvent?(callback: (event: BrowserAutomationEvent) => void): () => void;
    };
  }
}
