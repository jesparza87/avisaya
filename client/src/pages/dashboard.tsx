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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

interface HistoryItem {
  id: string;
  label: string;
  created_at: string;
  notified_at: string | null;
  wait_seconds: number | null;
}

interface StatsData {
  total_today: number;
  avg_wait_seconds: number | null;
  orders_by_hour: { hour: string; count: number }[];
}

function formatWait(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // History tab state
  const [historyDate, setHistoryDate] = useState<string>(todayISO());

  // Fetch current user info
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

  // Fetch history
  const {
    data: historyItems = [],
    isLoading: historyLoading,
    isError: historyError,
  } = useQuery<HistoryItem[]>({
    queryKey: ["history", historyDate],
    queryFn: () =>
      apiRequest<HistoryItem[]>(
        "GET",
        `/api/analytics/history?date=${historyDate}`
      ),
    retry: false,
  });

  // Fetch stats
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => apiRequest<StatsData>("GET", "/api/analytics/stats"),
    refetchInterval: 30000,
    retry: false,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (newLabel: string) =>
      apiRequest<Order>("POST", "/api/orders", { label: newLabel }),
    onSuccess: async (order) => {
      setLabel("");
      setFormError(null);
      setCreatedOrder(order);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });

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
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Mark as collected mutation
  const markCollectedMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<Order>("PATCH", `/api/orders/${id}/collected`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["history", historyDate] });
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

  const activeOrders = orders.filter(
    (o) => o.status === "waiting" || o.status === "ready"
  );

  const handleDownloadCSV = () => {
    if (historyItems.length === 0) return;
    const header = "ID,Pedido,Hora,Notificado,Espera (s)";
    const rows = historyItems.map((item) =>
      [
        item.id,
        `"${item.label.replace(/"/g, '""')}"`,
        new Date(item.created_at).toLocaleTimeString(),
        item.notified_at
          ? new Date(item.notified_at).toLocaleTimeString()
          : "",
        item.wait_seconds ?? "",
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-${historyDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Tabs defaultValue="activos">
          <TabsList className="mb-6">
            <TabsTrigger value="activos">Activos</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="stats">Estadísticas</TabsTrigger>
          </TabsList>

          {/* ── TAB: ACTIVOS ── */}
          <TabsContent value="activos" className="space-y-8">
            {/* Create Order Form */}
            <section className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Nuevo pedido
              </h2>
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
                <p className="text-red-600 text-sm">
                  Error al cargar los pedidos.
                </p>
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
                            onClick={() =>
                              markCollectedMutation.mutate(order.id)
                            }
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
          </TabsContent>

          {/* ── TAB: HISTORIAL ── */}
          <TabsContent value="historial">
            <section className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Historial de pedidos recogidos
                </h2>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="w-40"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadCSV}
                    disabled={historyItems.length === 0}
                  >
                    Descargar CSV
                  </Button>
                </div>
              </div>

              {historyLoading && (
                <p className="text-gray-500 text-sm">Cargando historial...</p>
              )}

              {historyError && (
                <p className="text-red-600 text-sm">
                  Error al cargar el historial.
                </p>
              )}

              {!historyLoading && historyItems.length === 0 && (
                <p className="text-gray-400 text-sm">
                  No hay pedidos recogidos para esta fecha.
                </p>
              )}

              {historyItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4 font-medium">Pedido</th>
                        <th className="pb-2 pr-4 font-medium">Hora</th>
                        <th className="pb-2 font-medium">Espera</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="py-2 pr-4 font-medium text-gray-900">
                            {item.label}
                          </td>
                          <td className="py-2 pr-4 text-gray-500">
                            {new Date(item.created_at).toLocaleTimeString()}
                          </td>
                          <td className="py-2 text-gray-700">
                            {formatWait(item.wait_seconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── TAB: ESTADÍSTICAS ── */}
          <TabsContent value="stats">
            <div className="space-y-6">
              {statsLoading && (
                <p className="text-gray-500 text-sm">
                  Cargando estadísticas...
                </p>
              )}

              {statsError && (
                <p className="text-red-600 text-sm">
                  Error al cargar las estadísticas.
                </p>
              )}

              {stats && (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="border shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-sm text-gray-500 mb-1">
                          Pedidos hoy
                        </p>
                        <p className="text-4xl font-bold text-gray-900">
                          {stats.total_today}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border shadow-sm">
                      <CardContent className="p-6">
                        <p className="text-sm text-gray-500 mb-1">
                          Tiempo medio de espera
                        </p>
                        <p className="text-4xl font-bold text-gray-900">
                          {stats.avg_wait_seconds !== null
                            ? `${Math.round(stats.avg_wait_seconds / 60)} min`
                            : "—"}
                        </p>
                        {stats.avg_wait_seconds !== null && (
                          <p className="text-xs text-gray-400 mt-1">
                            ({stats.avg_wait_seconds}s)
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Bar Chart */}
                  <Card className="border shadow-sm">
                    <CardContent className="p-6">
                      <h3 className="text-base font-semibold text-gray-800 mb-4">
                        Pedidos por hora (últimas 8h)
                      </h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={stats.orders_by_hour}
                          margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f0f0f0"
                          />
                          <XAxis
                            dataKey="hour"
                            tick={{ fontSize: 12, fill: "#6b7280" }}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 12, fill: "#6b7280" }}
                          />
                          <Tooltip
                            formatter={(value: number) => [value, "Pedidos"]}
                            labelFormatter={(lbl) => `Hora: ${lbl}`}
                          />
                          <Bar
                            dataKey="count"
                            fill="#16a34a"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
            <Button className="w-full" onClick={() => setQrDialogOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
