import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdatePageTitle } from "@humansignal/core";
import { Button, Badge } from "@humansignal/ui";
import { useAPI } from "../../providers/ApiProvider";
import { cn } from "../../utils/bem";
import { Spinner } from "../../components";
import { modal } from "../../components/Modal/Modal";
import { IconPlus } from "@humansignal/icons";
import "./AdminUsersPage.prefix.css";

const rootClass = cn("admin-users");

const CreateUserModal = ({ onSubmit }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit({ email, password, first_name: firstName, last_name: lastName });
    } catch (err) {
      setError(err?.message || "创建用户失败");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={rootClass.elem("create-form").toClassName()}>
      {error && <div className={rootClass.elem("error").toClassName()}>{error}</div>}
      <div className={rootClass.elem("field").toClassName()}>
        <label>邮箱 *</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
      </div>
      <div className={rootClass.elem("field").toClassName()}>
        <label>密码 *</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少8位" />
      </div>
      <div className={rootClass.elem("field").toClassName()}>
        <label>姓</label>
        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className={rootClass.elem("field").toClassName()}>
        <label>名</label>
        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className={rootClass.elem("actions").toClassName()}>
        <Button type="submit" variant="primary" size="small">创建用户</Button>
      </div>
    </form>
  );
};

export const AdminUsersPage = () => {
  const api = useAPI();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef(null);

  useUpdatePageTitle("用户管理");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const response = await api.callApi("adminUsers");
    if (response) {
      setUsers(response);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = useCallback(async (data) => {
    const response = await api.callApi("adminCreateUser", { body: data });
    if (response?.id) {
      fetchUsers();
      modalRef.current?.close();
    } else {
      throw new Error(JSON.stringify(response));
    }
  }, [api, fetchUsers]);

  const openCreateModal = useCallback(() => {
    modalRef.current = modal({
      title: "创建新用户",
      body: () => <CreateUserModal onSubmit={handleCreateUser} />,
    });
  }, [handleCreateUser]);

  const handleToggleActive = useCallback(async (user) => {
    await api.callApi("adminUpdateUser", {
      params: { pk: user.id },
      body: { is_active: !user.is_active },
    });
    fetchUsers();
  }, [api, fetchUsers]);

  const handleResetPassword = useCallback(async (user) => {
    const newPassword = window.prompt(`请输入用户 ${user.email} 的新密码（至少8位）：`);
    if (!newPassword || newPassword.length < 8) {
      if (newPassword !== null) window.alert("密码长度至少为8位");
      return;
    }
    const response = await api.callApi("adminUpdateUser", {
      params: { pk: user.id },
      body: { password: newPassword },
    });
    if (response?.id) {
      window.alert("密码重置成功");
    }
  }, [api]);

  const handleDelete = useCallback(async (user) => {
    if (user.is_superuser) return;
    const confirmed = window.confirm(`确定要删除用户 ${user.email} 吗？此操作会禁用该用户。`);
    if (!confirmed) return;
    await api.callApi("adminDeleteUser", { params: { pk: user.id } });
    fetchUsers();
  }, [api, fetchUsers]);

  if (loading) return <Spinner />;

  return (
    <div className={rootClass.toClassName()}>
      <div className={rootClass.elem("header").toClassName()}>
        <h1>用户管理</h1>
        <Button icon={<IconPlus />} onClick={openCreateModal} variant="primary" size="small">
          创建用户
        </Button>
      </div>
      <div className={rootClass.elem("table-wrapper").toClassName()}>
        <table className={rootClass.elem("table").toClassName()}>
          <thead>
            <tr>
              <th>ID</th>
              <th>邮箱</th>
              <th>姓名</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={!user.is_active ? rootClass.elem("inactive").toClassName() : ""}>
                <td>{user.id}</td>
                <td>{user.email}</td>
                <td>{[user.last_name, user.first_name].filter(Boolean).join("") || "-"}</td>
                <td>
                  {user.is_superuser
                    ? <Badge variant="negative" size="small">系统管理员</Badge>
                    : <Badge variant="info" size="small">普通用户</Badge>
                  }
                </td>
                <td>
                  {user.is_active
                    ? <Badge variant="positive" size="small">已启用</Badge>
                    : <Badge variant="neutral" size="small">已禁用</Badge>
                  }
                </td>
                <td>{new Date(user.date_joined).toLocaleDateString("zh-CN")}</td>
                <td>
                  <div className={rootClass.elem("row-actions").toClassName()}>
                    <Button size="small" onClick={() => handleResetPassword(user)}>
                      重置密码
                    </Button>
                    <Button size="small" onClick={() => handleToggleActive(user)}>
                      {user.is_active ? "禁用" : "启用"}
                    </Button>
                    {!user.is_superuser && (
                      <Button size="small" variant="negative" onClick={() => handleDelete(user)}>
                        删除
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

AdminUsersPage.title = "用户管理";
AdminUsersPage.path = "/admin/users";
AdminUsersPage.exact = true;
