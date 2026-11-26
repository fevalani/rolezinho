import { registerPlugin } from "@capacitor/core";

export interface PasskeyPlugin {
  authenticate(options: { optionsJson: string }): Promise<{
    credentialJson: string;
  }>;

  register(options: { optionsJson: string }): Promise<{
    credentialJson: string;
  }>;
}

export const Passkey = registerPlugin<PasskeyPlugin>("Passkey");