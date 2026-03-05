import { Link } from "wouter";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-800">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shadow-sm">
        <span className="text-2xl font-bold text-indigo-600">AvisaYa</span>
        <Link
          href="/login"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-600 hover:border-indigo-800 rounded-md px-4 py-2 transition-colors"
        >
          Entrar
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 bg-indigo-50">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          Elimina el busca,<br className="hidden sm:block" /> usa el móvil
        </h1>
        <p className="max-w-xl text-lg text-gray-600 mb-10">
          AvisaYa reemplaza los buscapersonas físicos con códigos QR y
          notificaciones web push. Tus clientes escanean, esperan donde quieran
          y reciben un aviso instantáneo en su móvil — sin descargar ninguna app.
          Perfecto para restaurantes, bares y cualquier local de hostelería.
        </p>
        <Link
          href="/register"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-md transition-colors"
        >
          Empieza gratis
        </Link>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          ¿Por qué AvisaYa?
        </h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="flex flex-col items-center text-center bg-indigo-50 rounded-2xl p-8 shadow-sm">
            <div className="text-5xl mb-4">📱</div>
            <h3 className="text-xl font-bold text-indigo-700 mb-2">Sin app</h3>
            <p className="text-gray-600 text-sm">
              Los clientes solo necesitan escanear el QR con la cámara de su
              móvil. Sin descargas, sin registros, sin fricciones.
            </p>
          </div>
          {/* Card 2 */}
          <div className="flex flex-col items-center text-center bg-indigo-50 rounded-2xl p-8 shadow-sm">
            <div className="text-5xl mb-4">⚡</div>
            <h3 className="text-xl font-bold text-indigo-700 mb-2">Tiempo real</h3>
            <p className="text-gray-600 text-sm">
              Notificaciones push instantáneas directamente en el navegador del
              cliente en cuanto su pedido esté listo.
            </p>
          </div>
          {/* Card 3 */}
          <div className="flex flex-col items-center text-center bg-indigo-50 rounded-2xl p-8 shadow-sm">
            <div className="text-5xl mb-4">🖥️</div>
            <h3 className="text-xl font-bold text-indigo-700 mb-2">Fácil gestión</h3>
            <p className="text-gray-600 text-sm">
              Dashboard web intuitivo para gestionar todos tus pedidos activos,
              avisar clientes y consultar el historial con un solo clic.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 bg-gray-50">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Planes</h2>
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Free */}
          <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Free</h3>
            <p className="text-4xl font-extrabold text-indigo-600 mb-1">
              0<span className="text-lg font-medium text-gray-500">€/mes</span>
            </p>
            <ul className="text-sm text-gray-600 mt-4 mb-8 space-y-2 flex-1">
              <li>✅ Hasta 30 pedidos/día</li>
              <li>✅ 1 local</li>
            </ul>
            <Link
              href="/register"
              className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Empezar gratis
            </Link>
          </div>

          {/* Starter */}
          <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Starter</h3>
            <p className="text-4xl font-extrabold text-indigo-600 mb-1">
              19<span className="text-lg font-medium text-gray-500">€/mes</span>
            </p>
            <ul className="text-sm text-gray-600 mt-4 mb-8 space-y-2 flex-1">
              <li>✅ Pedidos ilimitados</li>
              <li>✅ 1 local</li>
              <li>✅ Estadísticas básicas</li>
            </ul>
            <Link
              href="/register"
              className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Empezar
            </Link>
          </div>

          {/* Pro */}
          <div className="flex flex-col bg-indigo-600 rounded-2xl border border-indigo-600 shadow-md p-8 text-white">
            <div className="text-xs font-bold uppercase tracking-widest bg-white text-indigo-600 rounded-full px-3 py-1 self-start mb-3">
              Popular
            </div>
            <h3 className="text-xl font-bold mb-1">Pro</h3>
            <p className="text-4xl font-extrabold mb-1">
              39<span className="text-lg font-medium text-indigo-200">€/mes</span>
            </p>
            <ul className="text-sm text-indigo-100 mt-4 mb-8 space-y-2 flex-1">
              <li>✅ Hasta 3 locales</li>
              <li>✅ Estadísticas avanzadas</li>
              <li>🔜 WhatsApp (próximo)</li>
            </ul>
            <Link
              href="/register"
              className="block text-center bg-white hover:bg-indigo-50 text-indigo-600 font-semibold py-2 rounded-lg transition-colors"
            >
              Empezar
            </Link>
          </div>

          {/* Chain */}
          <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Chain</h3>
            <p className="text-4xl font-extrabold text-indigo-600 mb-1">
              89<span className="text-lg font-medium text-gray-500">€/mes</span>
            </p>
            <ul className="text-sm text-gray-600 mt-4 mb-8 space-y-2 flex-1">
              <li>✅ Locales ilimitados</li>
              <li>✅ API access</li>
              <li>✅ Soporte prioritario</li>
            </ul>
            <Link
              href="/register"
              className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Contactar
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-white border-t border-gray-200 text-center text-sm text-gray-500">
        AvisaYa 2026 — Sistema de llamadas para hostelería
      </footer>
    </div>
  );
}
