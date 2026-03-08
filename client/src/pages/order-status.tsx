import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";

interface Order {
  id: string;
  token: string;
  label: string;
  status: "waiting" | "ready" | "collected";
  venue_id: string;
  created_at: string;
  notified_at: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

async function fetchOrderByToken(token: string): Promise<Order> {
  const res = await fetch(`${API_BASE}/api/orders/token/${token}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "not_found" : "error");
  }
  return res.json();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function OrderStatus() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingState, setLoadingState] = useState<"loading" | "error" | "not_found" | "ok">("loading");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "requesting" | "subscribed" | "denied" | "error">("idle");
  const [celebrate, setCelebrate] = useState(false);
  const prevStatus = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check push support
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        const data = await fetchOrderByToken(token);
        setOrder(data);
        setLoadingState("ok");

        // Trigger celebration if status just changed to ready
        if (prevStatus.current === "waiting" && data.status === "ready") {
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 3000);
        }
        prevStatus.current = data.status;

        // Stop polling if terminal state
        if (data.status === "collected") {
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (err: any) {
        if (err.message === "not_found") {
          setLoadingState("not_found");
        } else {
          setLoadingState("error");
        }
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };

    load();

    pollingRef.current = setInterval(load, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [token]);

  const handleSubscribePush = async () => {
    if (!order) return;
    setPushState("requesting");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        return;
      }

      const vapidRes = await fetch(`${API_BASE}/api/push/vapid-key`);
      const { publicKey } = await vapidRes.json();

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = subscription.toJSON();

      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          subscription: {
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth,
            },
          },
        }),
      });

      setPushState("subscribed");
    } catch (err) {
      console.error("Push subscription error:", err);
      setPushState("error");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadingState === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 px-4">
        <div className="animate-spin rounded-full h-14 w-14 border-4 border-orange-400 border-t-transparent mb-4" />
        <p className="text-orange-600 text-lg font-medium">Cargando tu pedido...</p>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (loadingState === "not_found") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 px-4 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Pedido no encontrado</h1>
        <p className="text-gray-500 max-w-xs">
          No hemos podido encontrar tu pedido. Comprueba que el enlace es correcto o pide ayuda al personal.
        </p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (loadingState === "error" || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 px-4 text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Algo ha ido mal</h1>
        <p className="text-gray-500 max-w-xs">
          No hemos podido cargar tu pedido. Inténtalo de nuevo en unos segundos.
        </p>
      </div>
    );
  }

  // ── Waiting ──────────────────────────────────────────────────────────────
  if (order.status === "waiting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 px-4 text-center">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full">
          <div className="text-7xl mb-4 animate-pulse">⏳</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Tu pedido está en preparación</h1>
          <p className="text-orange-500 font-semibold text-lg mb-6">{order.label}</p>

          {pushSupported ? (
            <div>
              {pushState === "idle" && (
                <button
                  onClick={handleSubscribePush}
                  className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3 px-6 rounded-2xl transition-colors text-base shadow-md"
                >
                  🔔 Avisarme cuando esté listo
                </button>
              )}
              {pushState === "requesting" && (
                <p className="text-gray-500 text-sm">Activando notificaciones...</p>
              )}
              {pushState === "subscribed" && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <p className="text-green-700 font-semibold">✅ ¡Listo! Te avisaremos cuando tu pedido esté preparado.</p>
                </div>
              )}
              {pushState === "denied" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <p className="text-yellow-700 text-sm">
                    Has bloqueado las notificaciones. Mantén esta pestaña abierta para ver el estado.
                  </p>
                </div>
              )}
              {pushState === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-red-600 text-sm">
                    No se han podido activar las notificaciones. Mantén esta pestaña abierta.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-blue-700 text-sm">
                📱 Te avisaremos en esta pantalla. Mantén la pestaña abierta.
              </p>
            </div>
          )}

          <p className="text-gray-400 text-xs mt-6">Esta página se actualiza automáticamente</p>
        </div>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────
  if (order.status === "ready") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 px-4 text-center">
        <div className={`bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full ${celebrate ? "animate-bounce" : ""}`}>
          <div className="text-7xl mb-4">🔔</div>
          <h1 className="text-3xl font-bold text-green-700 mb-2">¡Tu pedido está listo! 🎉</h1>
          <p className="text-green-600 font-semibold text-xl mb-4">{order.label}</p>
          <div className="bg-green-100 rounded-2xl p-4 mb-4">
            <p className="text-green-800 font-medium text-lg">Pasa a recogerlo</p>
          </div>
          {celebrate && (
            <div className="text-4xl animate-ping absolute">✨</div>
          )}
        </div>
      </div>
    );
  }

  // ── Collected ────────────────────────────────────────────────────────────
  if (order.status === "collected") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full">
          <div className="text-7xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-700 mb-2">Pedido recogido ✓</h1>
          <p className="text-gray-500">{order.label}</p>
        </div>
      </div>
    );
  }

  return null;
}
