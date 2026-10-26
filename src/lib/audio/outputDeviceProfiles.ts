import type { AudioProcessingConfig } from "./eqConfig";

export interface OutputDeviceProfile {
  deviceKey: string;
  label: string;
  config: AudioProcessingConfig;
}

export interface OutputDeviceProfileState {
  salt: string;
  activeDeviceKey: string;
  profiles: OutputDeviceProfile[];
}

export const emptyOutputDeviceProfiles = (): OutputDeviceProfileState => ({ salt: crypto.randomUUID(), activeDeviceKey: "", profiles: [] });

export function parseOutputDeviceProfiles(serialized: string): OutputDeviceProfileState {
  try {
    const value = JSON.parse(serialized) as Partial<OutputDeviceProfileState>;
    if (!value || typeof value.salt !== "string" || !Array.isArray(value.profiles)) return emptyOutputDeviceProfiles();
    return { salt: value.salt, activeDeviceKey: typeof value.activeDeviceKey === "string" ? value.activeDeviceKey : "", profiles: value.profiles.filter((profile): profile is OutputDeviceProfile => !!profile && typeof profile.deviceKey === "string" && typeof profile.label === "string" && !!profile.config).slice(0, 32) };
  } catch { return emptyOutputDeviceProfiles(); }
}

export async function hashOutputDevice(salt: string, device: Pick<MediaDeviceInfo, "deviceId" | "groupId" | "label">): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}\0${device.deviceId}\0${device.groupId}\0${device.label}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function currentOutputDevice(salt: string): Promise<{ key: string; label: string } | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  const outputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audiooutput");
  const device = outputs.find((item) => item.deviceId === "default") ?? outputs[0];
  if (!device) return null;
  return { key: await hashOutputDevice(salt, device), label: device.label || "System output" };
}
