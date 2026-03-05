import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { apiRequest } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Order {
  id: string;
  venue_id: string;
  token: string;
  label: string;
  status: string;
  created_at: string;
  notified_at: string | null;
}

interface User {
  id: string;
  email: string;
  venue_id: string | null;
  role: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history" | "stats">("active");

  // Fetch current user info (to display venue name if available)
  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiRequest<User>("GET", "/api/auth/me"),
    retry: false,
  });

  // Fetch orders with polling every 10 seconds
  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: async () => {
      try {
        return await apiRequest<Order[]>("GET", "/api/orders");
      } catch (err: any) {
        if (err?.status === 401) {
          navigate("/login");
        }
        throw err;
      }
    },
    refetchInterval: 10000,
    retry: false,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (label: string) =>
      apiRequest<Order>("POST", "/api/orders", { label }),
    onSuccess: async (order) => {
      setLabel("");
      setFormError(null);
      setCreatedOrder(order);
      queryClient.invalidateQueries({ queryKey: ["orders"] });

      // Generate QR code
      const qrUrl = `${window.location.origin}/order/${order.token}`;
      try {
        const dataUrl = await QRCode.toDataURL(qrUrl, { width: 256, margin: 2 });
        setQrDataUrl(dataUrl);
        setQrDialogOpen(true);
      } catch (err) {
        console.error("Error generating QR code:", err);
      }
    },
    onError: (err: any) => {
      setFormError(err?.message || "Error al crear el pedido");
    },
  });

  // Mark as ready mutation
  const markReadyMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<Order>("PATCH", `/api/orders/${id}/ready`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  // Mark as collected mutation
  const markCollectedMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<Order>("PATCH", `/api/orders/${id}/collected`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      navigate("/login");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setFormError("El nombre del pedido es obligatorio");
      return;
    }
    setFormError(null);
    createOrderMutation.mutate(label.trim());
  };

  // Filter active orders (waiting or ready)
  const activeOrders = orders.filter(
    (o) => o.status === "waiting" || o.status === "ready"
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Pedidos</h1>
            {user?.email && (
              <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "Saliendo..." : "Cerrar sesión"}
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setActiveTab("active")}
            className={
              activeTab === "active"
                ? "font-bold border-b-2 border-blue-500 pb-1 px-1"
                : "text-gray-500 pb-1 px-1"
            }
          >
            Activos
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={
              activeTab === "history"
                ? "font-bold border-b-2 border-blue-500 pb-1 px-1"
                : "text-gray-500 pb-1 px-1"
            }
          >
            Historial
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={
              activeTab === "stats"
                ? "font-bold border-b-2 border-blue-500 pb-1 px-1"
                : "text-gray-500 pb-1 px-1"
            }
          >
            Stats
          </button>
        </div>

        {activeTab === "active" && (
          <>
            {/* Create Order Form */}
            <section className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Nuevo pedido</h2>
              <form onSubmit={handleSubmit} className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Nombre o número del pedido (ej: Mesa 4)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="flex-1"
                  maxLength={100}
                  disabled={createOrderMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={createOrderMutation.isPending}
                  className="whitespace-nowrap"
                >
                  {createOrderMutation.isPending ? "Creando..." : "Crear pedido"}
                </Button>
              </form>
              {formError && (
                <p className="mt-2 text-sm text-red-600">{formError}</p>
              )}
            </section>

            {/* Orders List */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Pedidos activos{" "}
                <span className="text-gray-400 font-normal text-base">
                  ({activeOrders.length})
                </span>
              </h2>

              {isLoading && (
                <p className="text-gray-500 text-sm">Cargando pedidos...</p>
              )}

              {isError && (
                <p className="text-red-600 text-sm">Error al cargar los pedidos.</p>
              )}

              {!isLoading && activeOrders.length === 0 && (
                <p className="text-gray-400 text-sm">No hay pedidos activos.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {activeOrders.map((order) => (
                  <Card key={order.id} className="border shadow-sm">
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-base">
                            {order.label}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(order.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                        {order.status === "waiting" ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                            Esperando
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                            Listo
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {order.status === "waiting" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white flex-1"
                            onClick={() => markReadyMutation.mutate(order.id)}
                            disabled={markReadyMutation.isPending}
                          >
                            ✓ Listo
                          </Button>
                        )}
                        {order.status === "ready" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => markCollectedMutation.mutate(order.id)}
                            disabled={markCollectedMutation.isPending}
                          >
                            Recogido
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "history" && (
          <HistoryTab venueId={user?.venue_id ?? ""} />
        )}

        {activeTab === "stats" && (
          <StatsTab venueId={user?.venue_id ?? ""} />
        )}
      </main>

      {/* QR Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pedido creado</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {createdOrder && (
              <p className="text-gray-600 text-sm text-center">
                Muestra este QR al cliente para que pueda seguir su pedido:{" "}
                <span className="font-semibold">{createdOrder.label}</span>
              </p>
            )}
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR del pedido"
                className="rounded-lg border"
                width={256}
                height={256}
              />
            )}
            {createdOrder && (
              <p className="text-xs text-gray-400 break-all text-center">
                {`${window.location.origin}/order/${createdOrder.token}`}
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => setQrDialogOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryTab({ venueId }: { venueId: string }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["history", date],
    queryFn: () =>
      apiRequest<any[]>("GET", "/api/analytics/history?date=" + date),
    enabled: !!venueId,
  });

  const downloadCSV = () => {
    const rows = [
      ["Pedido", "Hora", "Espera(s)"],
      ...history.map((h) => [
        h.label,
        new Date(h.created_at).toLocaleTimeString(),
        h.wait_seconds ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(csv);
    a.download = "historial.csv";
    a.click();
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Historial de pedidos</h2>
      <div className="flex gap-2 mb-3 items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded p-1 text-sm"
        />
        <button
          onClick={downloadCSV}
          className="text-xs bg-gray-100 border rounded px-2 py-1 hover:bg-gray-200"
        >
          Descargar CSV
        </button>
      </div>
      {history.length === 0 ? (
        <p className="text-gray-400 text-sm">No hay pedidos para esta fecha.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 font-semibold text-gray-700">Pedido</th>
              <th className="text-left py-1 font-semibold text-gray-700">Hora</th>
              <th className="text-left py-1 font-semibold text-gray-700">Espera</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b">
                <td className="py-1">{h.label}</td>
                <td className="py-1">{new Date(h.created_at).toLocaleTimeString()}</td>
                <td className="py-1">
                  {h.wait_seconds != null ? h.wait_seconds + "s" : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatsTab({ venueId }: { venueId: string }) {
  const { data: stats } = useQuery<any>({
    queryKey: ["stats"],
    queryFn: () => apiRequest<any>("GET", "/api/analytics/stats"),
    enabled: !!venueId,
    refetchInterval: 60000,
  });

  const maxCount =
    stats?.orders_by_hour
      ? Math.max(...stats.orders_by_hour.map((x: any) => x.count), 1)
      : 1;

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Estadísticas</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded p-3 text-center">
          <div className="text-2xl font-bold">{stats?.total_today ?? 0}</div>
          <div className="text-xs text-gray-500">Pedidos hoy</div>
        </div>
        <div className="border rounded p-3 text-center">
          <div className="text-2xl font-bold">
            {stats?.avg_wait_seconds != null
              ? Math.round(stats.avg_wait_seconds / 60) + "m"
              : "-"}
          </div>
          <div className="text-xs text-gray-500">Espera media</div>
        </div>
      </div>
      {stats?.orders_by_hour && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Pedidos por hora</div>
          <div className="flex items-end gap-1 h-20">
            {stats.orders_by_hour.map((h: any) => (
              <div key={h.hour} className="flex flex-col items-center flex-1">
                <div
                  className="bg-blue-400 w-full rounded-t"
                  style={{
                    height:
                      Math.max(4, (h.count / maxCount) * 60) + "px",
                  }}
                />
                <div
                  className="text-gray-400 text-center"
                  style={{ fontSize: "9px" }}
                >
                  {h.hour.split(":")[0]}h
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!stats && (
        <p className="text-gray-400 text-sm">Cargando estadísticas...</p>
      )}
    </div>
  );
}
