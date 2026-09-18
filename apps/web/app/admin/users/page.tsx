'use client';

import { useEffect, useState } from 'react';
import { Users as UsersIcon, Pencil } from 'lucide-react';
import { apiFetch, User, formatDate } from '@/lib/admin';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  Table,
  Td,
  Th,
  THead,
  TRow,
} from '@/components/admin/ui';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleChangeId, setRoleChangeId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
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
      setRoleLoading(true);
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
    } finally {
      setRoleLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const roleButtonClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Gestiona los usuarios de tu tienda"
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por nombre o email..."
          className="max-w-md"
        />
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Cargando usuarios..." />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No hay usuarios"
            description="Los usuarios registrados en tu tienda aparecerán aquí."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <Th>Usuario</Th>
                    <Th>Email</Th>
                    <Th>Órdenes</Th>
                    <Th>Rol</Th>
                    <Th>Registro</Th>
                  </tr>
                </THead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <TRow key={user.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-600">
                            {user.name.charAt(0)}
                          </div>
                          <div className="font-semibold text-slate-900">
                            {user.name}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-slate-600">{user.email}</Td>
                      <Td>
                        <Badge tone="blue">
                          {user._count?.orders || 0}
                        </Badge>
                      </Td>
                      <Td>
                        {roleChangeId === user.id ? (
                          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <button
                              onClick={() => handleRoleChange(user.id, 'ADMIN')}
                              disabled={roleLoading}
                              className={roleButtonClass(user.role === 'ADMIN')}
                            >
                              Admin
                            </button>
                            <button
                              onClick={() => handleRoleChange(user.id, 'CUSTOMER')}
                              disabled={roleLoading}
                              className={roleButtonClass(user.role === 'CUSTOMER')}
                            >
                              Cliente
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRoleChangeId(user.id)}
                            className="group inline-flex items-center gap-1.5"
                            title="Cambiar rol"
                          >
                            <Badge tone={user.role === 'ADMIN' ? 'blue' : 'green'}>
                              {user.role === 'ADMIN' ? 'Admin' : 'Cliente'}
                            </Badge>
                            <Pencil className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500" />
                          </button>
                        )}
                      </Td>
                      <Td className="text-slate-500">
                        {formatDate(user.createdAt)}
                      </Td>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {filteredUsers.map((user) => (
                <Card key={user.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-600">
                      {user.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {user.email}
                      </p>
                    </div>
                    <Badge tone="blue">{user._count?.orders || 0} órdenes</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {roleChangeId === user.id ? (
                      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          onClick={() => handleRoleChange(user.id, 'ADMIN')}
                          disabled={roleLoading}
                          className={roleButtonClass(user.role === 'ADMIN')}
                        >
                          Admin
                        </button>
                        <button
                          onClick={() => handleRoleChange(user.id, 'CUSTOMER')}
                          disabled={roleLoading}
                          className={roleButtonClass(user.role === 'CUSTOMER')}
                        >
                          Cliente
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRoleChangeId(user.id)}
                        className="group inline-flex items-center gap-1.5"
                        title="Cambiar rol"
                      >
                        <Badge tone={user.role === 'ADMIN' ? 'blue' : 'green'}>
                          {user.role === 'ADMIN' ? 'Admin' : 'Cliente'}
                        </Badge>
                        <Pencil className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500" />
                      </button>
                    )}
                    <span className="text-xs text-slate-400">
                      {formatDate(user.createdAt)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}