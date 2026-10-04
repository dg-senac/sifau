import { supabase } from './supabase';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery_level?: number;
}

class LocationTracker {
  private watchId: number | null = null;
  private intervalId: number | null = null;
  private fiscalId: string | null = null;
  private isTracking = false;

  startTracking(fiscalId: string) {
    if (this.isTracking) {
      this.stopTracking();
    }

    this.fiscalId = fiscalId;
    this.isTracking = true;

    // Iniciar geolocalização em tempo real
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.sendLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            battery_level: this.getBatteryLevelSync(),
          });
        },
        (error) => {
          console.error('Erro de geolocalização:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }

    // Enviar localização periodicamente (backup)
    this.intervalId = window.setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.sendLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              battery_level: this.getBatteryLevelSync(),
            });
          },
          (error) => {
            console.error('Erro ao obter localização periódica:', error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      }
    }, 60000); // A cada 1 minuto
  }

  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isTracking = false;
    this.fiscalId = null;
  }

  private sendLocation(location: LocationData) {
    if (!this.fiscalId) return;

    supabase.from('fiscal_location').insert({
      fiscal_id: this.fiscalId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      battery_level: location.battery_level,
      is_online: true,
      last_seen: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) {
        console.error('Erro ao enviar localização:', error);
      }
    });
  }

  private getBatteryLevelSync(): number | null {
    if ('getBattery' in navigator) {
      try {
        const battery = (navigator as any).getBattery();
        if (battery instanceof Promise) {
          return null; // Não pode usar async aqui
        }
        return Math.round(battery.level * 100);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  private async getBatteryLevel(): Promise<number | null> {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        return Math.round(battery.level * 100);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async markOffline() {
    if (!this.fiscalId) return;

    try {
      await supabase.from('fiscal_location').insert({
        fiscal_id: this.fiscalId,
        latitude: 0,
        longitude: 0,
        is_online: false,
        last_seen: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Erro ao marcar offline:', error);
    }
  }
}

export const locationTracker = new LocationTracker();