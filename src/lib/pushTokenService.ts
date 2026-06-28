import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

export async function registerPushToken(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async ({ value: token }) => {
    const platform = Capacitor.getPlatform() as "android" | "ios";
    await supabase
      .from("push_tokens")
      .upsert({ user_id: userId, token, platform }, { onConflict: "user_id,token" });
  });
}
