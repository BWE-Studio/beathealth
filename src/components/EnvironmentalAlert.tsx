import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wind, Thermometer, Droplets, RefreshCw, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

interface EnvironmentalData {
  aqi: number;
  pm25: number;
  pm10: number;
  temperature: number;
  humidity: number;
  city: string;
}

const AQI_LEVELS = [
  { max: 50, label: "Good", color: "bg-green-500", textColor: "text-green-500", advice: "Air quality is satisfactory" },
  { max: 100, label: "Moderate", color: "bg-yellow-500", textColor: "text-yellow-500", advice: "Acceptable for most people" },
  { max: 150, label: "Unhealthy for Sensitive", color: "bg-orange-500", textColor: "text-orange-500", advice: "Sensitive groups should reduce outdoor activity" },
  { max: 200, label: "Unhealthy", color: "bg-red-500", textColor: "text-red-500", advice: "Everyone should reduce prolonged outdoor activity" },
  { max: 300, label: "Very Unhealthy", color: "bg-purple-500", textColor: "text-purple-500", advice: "Avoid outdoor activity, keep windows closed" },
  { max: 500, label: "Hazardous", color: "bg-rose-900", textColor: "text-rose-900", advice: "Stay indoors, use air purifier if available" },
];

const getAQILevel = (aqi: number) => {
  return AQI_LEVELS.find(level => aqi <= level.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
};

export const EnvironmentalAlert = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: envData, isLoading } = useQuery({
    queryKey: ["environmental-data"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get latest environmental log
      const { data, error } = await supabase
        .from("environmental_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        return {
          aqi: data.aqi,
          pm25: data.pm25 || 0,
          pm10: data.pm10 || 0,
          temperature: data.temperature_celsius || 0,
          humidity: data.humidity_percent || 0,
          city: data.city || "Unknown",
        } as EnvironmentalData;
      }

      return null;
    },
  });

  const fetchAirQuality = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!navigator.geolocation) throw new Error("Location is not available on this device");

      // Get current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: false,
        });
      });

      const { latitude, longitude } = position.coords;

      // Call edge function to fetch air quality
      const { data, error } = await supabase.functions.invoke("fetch-air-quality", {
        body: { lat: latitude, lon: longitude, userId: user.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["environmental-data"] });
      toast.success("Air quality updated");
    },
    onError: (error) => {
      console.error("Error fetching air quality:", error);
      const isPermissionDenied = typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 1;
      const message = isPermissionDenied
        ? "Location permission is needed to check local AQI."
        : "Air quality is unavailable right now.";
      setErrorMessage(message);
    },
    onSettled: () => {
      setIsRefreshing(false);
    },
  });

  // Auto-fetch on first load if no data
  useEffect(() => {
    if (isLoading || envData || !navigator.geolocation || !navigator.permissions) return;

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") {
          setIsRefreshing(true);
          fetchAirQuality.mutate();
        }
      })
      .catch(() => {
        // Some WebViews do not expose Permissions API reliably. Avoid auto-prompting.
      });
  }, [isLoading, envData]);

  const handleRefresh = async () => {
    setErrorMessage(null);

    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (status.state === "denied") {
          setErrorMessage("Location permission is blocked. Enable it in device settings to check local AQI.");
          return;
        }
      } catch {
        // Fall through to geolocation request on platforms without Permissions API support.
      }
    }

    setIsRefreshing(true);
    fetchAirQuality.mutate();
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="animate-pulse flex items-center gap-3">
            <div className="h-10 w-10 bg-muted rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!envData) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wind className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Air Quality</p>
                <p className="text-sm text-muted-foreground">
                  {errorMessage || "Tap to check local AQI"}
                </p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "Check"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const aqiLevel = getAQILevel(envData.aqi);
  const isUnhealthy = envData.aqi > 100;

  return (
    <Card className={`border-border/50 backdrop-blur-sm ${isUnhealthy ? "bg-orange-500/5 border-orange-500/30" : "bg-card/50"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-full ${aqiLevel.color} flex items-center justify-center`}>
              <span className="text-white font-bold">{envData.aqi}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className={`font-medium ${aqiLevel.textColor}`}>{aqiLevel.label}</p>
                {isUnhealthy && <AlertTriangle className="h-4 w-4 text-orange-500" />}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {envData.city}
              </p>
            </div>
          </div>
          <Button 
            size="icon" 
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Details Row */}
        <div className="flex gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wind className="h-3 w-3" />
            <span>PM2.5: {envData.pm25}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Thermometer className="h-3 w-3" />
            <span>{envData.temperature}°C</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Droplets className="h-3 w-3" />
            <span>{envData.humidity}%</span>
          </div>
        </div>

        {/* Health Advice */}
        {isUnhealthy && (
          <div className="mt-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-xs text-orange-600">
              {aqiLevel.advice}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
