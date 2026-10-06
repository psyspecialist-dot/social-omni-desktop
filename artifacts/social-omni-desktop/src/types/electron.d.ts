export {};

declare global {
  interface Window {
    socialOmni?: {
      readonly isDesktop: true;
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
      openPlatform(platform: string): Promise<void>;
    };
  }
}
