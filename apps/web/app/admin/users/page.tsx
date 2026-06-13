'use client';

import { useEffect, useState } from 'react';
import { apiFetch, User, formatDate } from '@/lib/admin';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleChangeId, setRoleChangeId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadUsers();
  }, [page]);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await apiFetch(`/users?page=${page}&limit=50`);
      if (data.items) {
        setUsers(data.items);
        setTotalPages(data.totalPages);
      } else {
        setUsers(data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar usuarios',
      );
    } finally {
      setLoading(false);
    }
  }

  const handleRoleChange = async (id: string, newRole: 'ADMIN' | 'CUSTOMER') => {
    try {
      const updated = await apiFetch(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? updated : u)),
      );
      setRoleChangeId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar usuario',
      );
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900">
          Usuarios
        </h1>
        <p className="text-gray-600 mt-1">
          Gestiona los usuarios de tu tienda
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Users list */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando usuarios...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg">No hay usuarios</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nombre</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Órdenes</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rol</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-semibold text-gray-900">{user.name}</td>
                      <td className="px-6 py-4 text-sm">{user.email}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                          {user._count?.orders || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {roleChangeId === user.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleRoleChange(user.id, 'ADMIN')}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${user.role === 'ADMIN' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-600'}`}>
                              Admin
                            </button>
                            <button onClick={() => handleRoleChange(user.id, 'CUSTOMER')}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${user.role === 'CUSTOMER' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-600'}`}>
                              Cliente
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setRoleChangeId(user.id)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {user.role}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <div key={user.id} className="p-4 space-y-3">
                  <div>
                    <div className="font-semibold text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500">Órdenes:</span>
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold text-xs">
                      {user._count?.orders || 0}
                    </span>
                    <span className="text-gray-500 ml-2">Rol:</span>
                    {roleChangeId === user.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleRoleChange(user.id, 'ADMIN')}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${user.role === 'ADMIN' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-600'}`}>
                          Admin
                        </button>
                        <button onClick={() => handleRoleChange(user.id, 'CUSTOMER')}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${user.role === 'CUSTOMER' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-600'}`}>
                          Cliente
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setRoleChangeId(user.id)}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {user.role}
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Registro: {formatDate(user.createdAt)}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-200">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
