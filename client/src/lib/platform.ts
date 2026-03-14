export type RuntimePlatform = "windows" | "macos" | "linux";

interface PortOption {
  value: string;
  label?: string;
}

const WINDOWS_PORTS: PortOption[] = [
  { value: "COM3" },
  { value: "COM4" },
  { value: "COM5" },
  { value: "COM6" },
  { value: "COM7" },
  { value: "COM8" },
  { value: "COM9" },
  { value: "COM10" },
];

const LINUX_PORTS: PortOption[] = [
  { value: "/dev/ttyACM0" },
  { value: "/dev/ttyACM1" },
  { value: "/dev/ttyUSB0" },
  { value: "/dev/ttyUSB1" },
  { value: "/dev/serial0" },
];

const MACOS_PORTS: PortOption[] = [
  { value: "/dev/cu.usbmodem14101" },
  { value: "/dev/cu.usbserial-0001" },
  { value: "/dev/cu.SLAB_USBtoUART" },
];

function dedupePorts(ports: PortOption[]): PortOption[] {
  const seen = new Set<string>();
  return ports.filter((port) => {
    if (seen.has(port.value)) return false;
    seen.add(port.value);
    return true;
  });
}

export function getRuntimePlatform(): RuntimePlatform {
  const electronPlatform =
    typeof window !== "undefined" ? (window as any)?.electronAPI?.platform : undefined;

  if (electronPlatform === "win32") return "windows";
  if (electronPlatform === "darwin") return "macos";
  if (electronPlatform === "linux") return "linux";

  if (typeof navigator !== "undefined") {
    const ua = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (ua.includes("win")) return "windows";
    if (ua.includes("mac")) return "macos";
  }

  return "linux";
}

export function getDefaultSerialPort(platform: RuntimePlatform): string {
  if (platform === "windows") return "COM3";
  if (platform === "macos") return "/dev/cu.usbmodem14101";
  return "/dev/ttyACM0";
}

export function getSerialPortOptions(platform: RuntimePlatform): PortOption[] {
  if (platform === "windows") {
    return dedupePorts([...WINDOWS_PORTS, ...LINUX_PORTS, ...MACOS_PORTS]);
  }
  if (platform === "macos") {
    return dedupePorts([...MACOS_PORTS, ...LINUX_PORTS, ...WINDOWS_PORTS]);
  }
  return dedupePorts([...LINUX_PORTS, ...MACOS_PORTS, ...WINDOWS_PORTS]);
}

export function getUsbGpsPortOptions(platform: RuntimePlatform): PortOption[] {
  return dedupePorts([{ value: "none" }, ...getSerialPortOptions(platform)]);
}

export function getUsbRadioPortOptions(platform: RuntimePlatform): PortOption[] {
  return dedupePorts([{ value: "none" }, ...getSerialPortOptions(platform)]);
}

export function getUsbCameraOptions(platform: RuntimePlatform): PortOption[] {
  const linuxCams: PortOption[] = [
    { value: "/dev/video0" },
    { value: "/dev/video1" },
    { value: "/dev/video2" },
  ];
  const windowsCams: PortOption[] = [{ value: "camera:0" }, { value: "camera:1" }];
  const macCams: PortOption[] = [{ value: "avfoundation:0" }, { value: "avfoundation:1" }];

  if (platform === "windows") {
    return dedupePorts([{ value: "none" }, ...windowsCams, ...linuxCams, ...macCams]);
  }
  if (platform === "macos") {
    return dedupePorts([{ value: "none" }, ...macCams, ...linuxCams, ...windowsCams]);
  }
  return dedupePorts([{ value: "none" }, ...linuxCams, ...macCams, ...windowsCams]);
}

export function getDefaultUsbCamera(platform: RuntimePlatform): string {
  if (platform === "windows") return "camera:0";
  if (platform === "macos") return "avfoundation:0";
  return "/dev/video0";
}
