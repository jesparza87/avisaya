import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "wouter";

type OrderStatus = "waiting" | "ready" | "collected";

interface PublicOrder {
  id: string;
  token: string;
  status: OrderStatus;
  order_number?: number;
  venue_name?: string;
}

type PageState = "loading" | "error" | "waiting" | "ready" | "collected";

const POLLING_INTERVAL = 5000;

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

function playBeep() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext not available
  }
}

function vibrateDevice() {
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
}

export default function OrderStatus() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAlertedReady = useRef(false);
  const previousStatus = useRef<OrderStatus | null>(null);

  const fetchOrder = useCallback(async (): Promise<PublicOrder | null> => {
    try {
      const res = await fetch(`/api/orders/${token}/public`);
      if (!res.ok) return null;
      const data = await res.json();
      return data as PublicOrder;
    } catch {
      return null;
    }
  }, [token]);

  const handleStatusChange = useCallback((newStatus: OrderStatus) => {
    if (
      newStatus === "ready" &&
      previousStatus.current !== "ready" &&
      !hasAlertedReady.current
    ) {
      hasAlertedReady.current = true;
      vibrateDevice();
      playBeep();
    }
    previousStatus.current = newStatus;
    setPageState(newStatus);
  }, []);

  // Initial load
  useEffect(() => {
    if (!token) {
      setPageState("error");
      return;
    }

    fetchOrder().then((data) => {
      if (!data) {
        setPageState("error");
        return;
      }
      setOrder(data);
      previousStatus.current = data.status;
      setPageState(data.status);
    });
  }, [token, fetchOrder]);

  // Check push support and fetch VAPID key
  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setPushSupported(supported);

    if (supported) {
      fetch("/api/push/vapid-key")
        .then((r) => r.json())
        .then((d) => setVapidKey(d.publicKey))
        .catch(() => {});
    }
  }, []);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Polling fallback — runs when push is not supported or not yet registered
  useEffect(() => {
    if (pageState === "loading" || pageState === "error") return;
    if (pageState === "collected") return;
    if (pushSupported && pushRegistered) return;

    pollingRef.current = setInterval(async () => {
      const data = await fetchOrder();
      if (!data) return;
      setOrder(data);
      handleStatusChange(data.status);
    }, POLLING_INTERVAL);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pageState, pushSupported, pushRegistered, fetchOrder, handleStatusChange]);

  const handleEnablePush = async () => {
    if (!pushSupported || !vapidKey) return;
    setPushLoading(true);
    setPushMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage("Permiso denegado. Usaremos actualización automática.");
        setPushLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          subscription: subscription.toJSON(),
        }),
      });

      if (res.ok) {
        setPushRegistered(true);
        setPushMessage("✅ Te avisaremos en este dispositivo");
        // Stop polling since push is now active
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        setPushMessage("Error al registrar. Usaremos actualización automática.");
      }
    } catch {
      setPushMessage("No se pudo activar. Usaremos actualización automática.");
    } finally {
      setPushLoading(false);
    }
  };

  // ── Screens ──────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-amber-500 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Cargando tu pedido…</p>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Pedido no encontrado
          </h1>
          <p className="text-gray-500">
            El enlace no es válido o el pedido ha expirado. Escanea el QR de
            nuevo.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === "collected") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-7xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-700 mb-2">
            Pedido recogido
          </h1>
          {order?.order_number && (
            <p className="text-gray-400">Pedido #{order.order_number}</p>
          )}
          <p className="text-gray-500 mt-4">¡Que lo disfrutes! 🍻</p>
        </div>
      </div>
    );
  }

  if (pageState === "ready") {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center border-4 border-green-400">
          {/* Pulsing bell */}
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute w-32 h-32 bg-green-200 rounded-full animate-ping opacity-60" />
            <div className="relative text-8xl animate-bounce">🔔</div>
          </div>
          <h1 className="text-3xl font-extrabold text-green-700 mb-2">
            ¡Tu pedido está listo!
          </h1>
          {order?.order_number && (
            <p className="text-green-600 font-semibold text-lg mb-1">
              Pedido #{order.order_number}
            </p>
          )}
          {order?.venue_name && (
            <p className="text-gray-500 mb-4">{order.venue_name}</p>
          )}
          <p className="text-green-600 font-medium">
            Acércate a recoger tu pedido 🍺
          </p>
        </div>
      </div>
    );
  }

  // waiting
  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        {/* Animated beer mug */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="text-8xl animate-pulse">🍺</div>
        </div>
        <h1 className="text-2xl font-bold text-amber-800 mb-2">
          Tu pedido está siendo preparado
        </h1>
        {order?.order_number && (
          <p className="text-amber-600 font-semibold mb-1">
            Pedido #{order.order_number}
          </p>
        )}
        {order?.venue_name && (
          <p className="text-gray-500 mb-4">{order.venue_name}</p>
        )}

        {/* Waiting dots */}
        <div className="flex justify-center gap-2 my-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 bg-amber-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

        <p className="text-gray-400 text-sm mb-6">
          Te avisaremos cuando esté listo
        </p>

        {/* Push notification button */}
        {pushSupported && !pushRegistered && (
          <button
            onClick={handleEnablePush}
            disabled={pushLoading}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {pushLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Activando…
              </>
            ) : (
              <>🔔 Avísame cuando esté listo</>
            )}
          </button>
        )}

        {/* Polling fallback notice */}
        {!pushSupported && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
            📡 Actualizando automáticamente cada 5 segundos
          </div>
        )}

        {/* Push feedback message */}
        {pushMessage && (
          <p
            className={`mt-3 text-sm font-medium ${
              pushMessage.startsWith("✅") ? "text-green-600" : "text-orange-500"
            }`}
          >
            {pushMessage}
          </p>
        )}

        {pushRegistered && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
            🔔 Recibirás una notificación cuando esté listo
          </div>
        )}
      </div>
    </div>
  );
}
