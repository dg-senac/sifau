import { supabase } from './supabase';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery_level?: number | null;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<{ level: number }>;
};

class LocationTracker {
  private watchId: number | null = null;
  private intervalId: number | null = null;
  private fiscalId: string | null = null;
  private isTracking = false;
  private lastSentAt = 0;
  private readonly minimumSendInterval = 60_000;

  startTracking(fiscalId: string) {
    if (this.isTracking && this.fiscalId === fiscalId) return;
    this.stopTracking();
    this.fiscalId = fiscalId;
    this.isTracking = true;
    this.lastSentAt = 0;

    if (!('geolocation' in navigator)) {
      console.warn('Este aparelho não disponibiliza geolocalização.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        void this.sendLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.warn('Não foi possível atualizar a localização do fiscal:', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );

    // O watch pode parar de emitir quando o aparelho fica parado; este fallback
    // mantém o último ponto atualizado sem gravar a mesma posição várias vezes.
    this.intervalId = window.setInterval(() => {
      if (!this.isTracking || !navigator.onLine) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void this.sendLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    }, this.minimumSendInterval);
  }

  stopTracking() {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.watchId = null;
    this.intervalId = null;
    this.isTracking = false;
    this.fiscalId = null;
  }

  private async sendLocation(location: LocationData) {
    const fiscalId = this.fiscalId;
    if (!fiscalId || !this.isTracking || !navigator.onLine) return;

    const now = Date.now();
    if (now - this.lastSentAt < this.minimumSendInterval) return;
    this.lastSentAt = now;

    const batteryLevel = await this.getBatteryLevel();
    if (!this.isTracking || this.fiscalId !== fiscalId || !navigator.onLine) return;

    try {
      const { error } = await supabase.rpc('record_fiscal_location', {
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_accuracy: location.accuracy ?? null,
        p_battery_level: batteryLevel,
      });
      if (error) console.error('Erro ao enviar localização:', error.message);
    } catch (error) {
      console.error('Falha de rede ao enviar localização:', error);
    }
  }

  private async getBatteryLevel(): Promise<number | null> {
    const getBattery = (navigator as NavigatorWithBattery).getBattery;
    if (!getBattery) return null;
    try {
      const battery = await getBattery.call(navigator);
      return Math.round(battery.level * 100);
    } catch {
      return null;
    }
  }

  async markOffline() {
    if (!navigator.onLine) return;
    try {
      const { error } = await supabase.rpc('mark_fiscal_offline');
      if (error) console.warn('Erro ao marcar fiscal como offline:', error.message);
    } catch (error) {
      console.warn('Falha de rede ao marcar fiscal como offline:', error);
    }
  }
}

export const locationTracker = new LocationTracker();
