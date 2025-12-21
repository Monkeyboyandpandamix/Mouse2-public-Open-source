import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function SettingsPanel() {
  const queryClient = useQueryClient();

  const { data: connectionSettings = [] } = useQuery({
    queryKey: ["/api/settings/connection"],
  });

  const { data: sensorSettings = [] } = useQuery({
    queryKey: ["/api/settings/sensor"],
  });

  const saveSetting = useMutation({
    mutationFn: async (setting: any) => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setting),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Setting saved successfully");
    },
  });

  return (
    <div className="h-full overflow-y-auto p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight font-sans">System Settings</h2>
          <p className="text-muted-foreground">Configure drone connections, sensors, and input devices</p>
        </div>

        <Tabs defaultValue="connections" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="input">Input Devices</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Orange Cube+ Connection</CardTitle>
                <CardDescription>Flight controller serial connection settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fc-port">Serial Port</Label>
                    <Input id="fc-port" placeholder="/dev/ttyACM0" defaultValue="/dev/ttyACM0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fc-baud">Baud Rate</Label>
                    <Select defaultValue="57600">
                      <SelectTrigger id="fc-baud">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9600">9600</SelectItem>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                        <SelectItem value="921600">921600</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="fc-auto">Auto-connect on startup</Label>
                  <Switch id="fc-auto" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WiFi Telemetry Link</CardTitle>
                <CardDescription>Ground station to Raspberry Pi communication</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wifi-ip">Drone IP Address</Label>
                    <Input id="wifi-ip" placeholder="192.168.1.100" defaultValue="192.168.1.100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wifi-port">Telemetry Port</Label>
                    <Input id="wifi-port" type="number" defaultValue="14550" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sensors" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>LiDAR Sensor (I2C Port 2)</CardTitle>
                <CardDescription>Precision distance and obstacle detection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lidar-addr">I2C Address</Label>
                    <Input id="lidar-addr" placeholder="0x62" defaultValue="0x62" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lidar-rate">Update Rate (Hz)</Label>
                    <Input id="lidar-rate" type="number" defaultValue="10" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="lidar-enable">Enable LiDAR</Label>
                  <Switch id="lidar-enable" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>HERE3+ GPS/Compass (CAN 2)</CardTitle>
                <CardDescription>Navigation and positioning system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gps-can">CAN Bus ID</Label>
                  <Input id="gps-can" type="number" defaultValue="1" />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="gps-enable">Enable GPS</Label>
                  <Switch id="gps-enable" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Sensors</CardTitle>
                <CardDescription>Custom sensor configurations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="custom-sensor">Sensor Name</Label>
                  <Input id="custom-sensor" placeholder="e.g., Rangefinder" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sensor-type">Interface Type</Label>
                    <Select defaultValue="i2c">
                      <SelectTrigger id="sensor-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="i2c">I2C</SelectItem>
                        <SelectItem value="spi">SPI</SelectItem>
                        <SelectItem value="uart">UART</SelectItem>
                        <SelectItem value="gpio">GPIO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sensor-addr">Address/Pin</Label>
                    <Input id="sensor-addr" placeholder="0x00 or GPIO pin" />
                  </div>
                </div>
                <Button variant="outline" className="w-full">Add Sensor</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="input" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>RC Controller</CardTitle>
                <CardDescription>Radio control transmitter configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rc-protocol">Protocol</Label>
                  <Select defaultValue="sbus">
                    <SelectTrigger id="rc-protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sbus">S.BUS</SelectItem>
                      <SelectItem value="ppm">PPM</SelectItem>
                      <SelectItem value="spektrum">Spektrum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="rc-failsafe">Enable failsafe</Label>
                  <Switch id="rc-failsafe" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gamepad/Joystick</CardTitle>
                <CardDescription>USB controller for manual override</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gamepad">Connected Device</Label>
                  <Select defaultValue="none">
                    <SelectTrigger id="gamepad">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None detected</SelectItem>
                      <SelectItem value="xbox">Xbox Controller</SelectItem>
                      <SelectItem value="ps4">PlayStation 4 Controller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="camera" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Camera Configuration</CardTitle>
                <CardDescription>Video stream and recording settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cam-res">Resolution</Label>
                  <Select defaultValue="1080p">
                    <SelectTrigger id="cam-res">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">1280x720 (720p)</SelectItem>
                      <SelectItem value="1080p">1920x1080 (1080p)</SelectItem>
                      <SelectItem value="4k">3840x2160 (4K)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cam-fps">Frame Rate</Label>
                  <Select defaultValue="30">
                    <SelectTrigger id="cam-fps">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 FPS</SelectItem>
                      <SelectItem value="30">30 FPS</SelectItem>
                      <SelectItem value="60">60 FPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cam-record">Auto-record on takeoff</Label>
                  <Switch id="cam-record" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex gap-4">
          <Button className="flex-1" size="lg">Save All Settings</Button>
          <Button variant="outline" size="lg">Reset to Defaults</Button>
        </div>
      </div>
    </div>
  );
}
