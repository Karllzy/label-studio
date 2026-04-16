import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@humansignal/ui";
import { IconPlus } from "@humansignal/icons";
import { Spinner } from "../../components";
import { modal } from "../../components/Modal/Modal";
import { useAPI } from "../../providers/ApiProvider";
import { useProject } from "../../providers/ProjectProvider";
import { cn } from "../../utils/bem";
import "./MembersSettings.prefix.css";

const rootClass = cn("members-settings");

const ROLE_LABELS = {
  AD: "管理员",
  AN: "标注员",
  RE: "审核员",
};

const ROLE_OPTIONS = [
  { value: "AN", label: ROLE_LABELS.AN },
  { value: "RE", label: ROLE_LABELS.RE },
  { value: "AD", label: ROLE_LABELS.AD },
];

const MANAGEABLE_GLOBAL_ROLES = new Set(["OW", "AD"]);

const getDisplayName = (userLike) => {
  return [userLike?.last_name, userLike?.first_name].filter(Boolean).join("") || userLike?.username || "-";
};

const matchUser = (member, query) => {
  if (!query) return true;

  const normalized = query.trim().toLowerCase();

  return [
    member.user?.email,
    member.user?.username,
    member.user?.first_name,
    member.user?.last_name,
    getDisplayName(member.user),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
};

const AddMemberModal = ({ organizationId, onSubmit, existingMembers }) => {
  const api = useAPI();
  const [orgUsers, setOrgUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [role, setRole] = useState("AN");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await api.callApi("memberships", {
          params: {
            pk: organizationId,
            page_size: -1,
          },
        });

        if (cancelled) return;

        const existingIds = new Set(existingMembers.map((member) => member.user_id));
        const candidates = (response?.results ?? []).filter((member) => !existingIds.has(member.user.id));
        setOrgUsers(candidates);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, existingMembers, organizationId]);

  const filteredUsers = useMemo(() => {
    return orgUsers.filter((member) => matchUser(member, query)).slice(0, 8);
  }, [orgUsers, query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const memberToSubmit = selectedMember ?? filteredUsers[0];
    if (memberToSubmit) onSubmit({ user_id: memberToSubmit.user.id, role });
  };

  const renderSelectedText = selectedMember
    ? `${selectedMember.user.email} (${getDisplayName(selectedMember.user)})`
    : "";

  if (loading) return <Spinner />;

  return (
    <form onSubmit={handleSubmit} className={rootClass.elem("add-form").toClassName()}>
      <div className={rootClass.elem("field").toClassName()}>
        <label>搜索用户</label>
        <input
          value={selectedMember ? renderSelectedText : query}
          onChange={(e) => {
            setSelectedMember(null);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !selectedMember && filteredUsers[0]) {
              e.preventDefault();
              setSelectedMember(filteredUsers[0]);
              setQuery(filteredUsers[0].user.email);
            }
          }}
          placeholder="输入邮箱、姓名或用户名搜索用户"
          autoFocus
        />
        {!selectedMember && query.trim() && (
          <div className={rootClass.elem("search-results").toClassName()}>
            {filteredUsers.length > 0 ? (
              filteredUsers.map((member) => (
                <button
                  key={member.user.id}
                  type="button"
                  className={rootClass.elem("search-item").toClassName()}
                  onClick={() => {
                    setSelectedMember(member);
                    setQuery(member.user.email);
                  }}
                >
                  <span>{getDisplayName(member.user)}</span>
                  <span>{member.user.email}</span>
                </button>
              ))
            ) : (
              <div className={rootClass.elem("search-empty").toClassName()}>未找到匹配的组织成员</div>
            )}
          </div>
        )}
        {selectedMember && (
          <div className={rootClass.elem("selected-user").toClassName()}>已选择：{renderSelectedText}</div>
        )}
      </div>
      <div className={rootClass.elem("field").toClassName()}>
        <label>角色</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={rootClass.elem("actions").toClassName()}>
        <Button type="submit" variant="primary" size="small" disabled={!selectedMember && !filteredUsers[0]}>
          添加成员
        </Button>
      </div>
    </form>
  );
};

export const MembersSettings = () => {
  const api = useAPI();
  const { project } = useProject();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef(null);

  const currentUserId = window.APP_SETTINGS?.user?.id;
  const globalRole = window.APP_SETTINGS?.user?.role;
  const canManageMembers = project?.my_project_role === "AD" || MANAGEABLE_GLOBAL_ROLES.has(globalRole);

  const fetchMembers = useCallback(async () => {
    if (!project?.id) return;

    setLoading(true);

    try {
      const response = await api.callApi("projectMembers", {
        params: { pk: project.id },
      });

      setMembers(Array.isArray(response) ? response : (response?.results ?? []));
    } finally {
      setLoading(false);
    }
  }, [api, project?.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleAddMember = useCallback(
    async (data) => {
      if (!canManageMembers) return;

      await api.callApi("addProjectMember", {
        params: { pk: project.id },
        body: data,
      });

      fetchMembers();
      modalRef.current?.close();
    },
    [api, canManageMembers, fetchMembers, project?.id],
  );

  const openAddModal = useCallback(() => {
    if (!canManageMembers) return;

    modalRef.current = modal({
      title: "添加项目成员",
      body: () => (
        <AddMemberModal organizationId={project.organization} onSubmit={handleAddMember} existingMembers={members} />
      ),
    });
  }, [canManageMembers, handleAddMember, members, project.organization]);

  const handleRoleChange = useCallback(
    async (member, newRole) => {
      if (!canManageMembers) return;

      await api.callApi("updateProjectMember", {
        params: { pk: project.id, memberPk: member.id },
        body: { role: newRole },
      });

      fetchMembers();
    },
    [api, canManageMembers, fetchMembers, project?.id],
  );

  const handleRemove = useCallback(
    async (member) => {
      if (!canManageMembers) return;

      if (member.user_id === currentUserId) {
        window.alert("不能移除当前登录的管理员本人。");
        return;
      }

      const confirmed = window.confirm(`确定要移除 ${member.email} 吗？`);
      if (!confirmed) return;

      await api.callApi("removeProjectMember", {
        params: { pk: project.id, memberPk: member.id },
      });

      fetchMembers();
    },
    [api, canManageMembers, currentUserId, fetchMembers, project?.id],
  );

  if (loading) return <Spinner />;

  return (
    <div className={rootClass.toClassName()}>
      <div className={rootClass.elem("header").toClassName()}>
        <h3>项目成员</h3>
        {canManageMembers && (
          <Button icon={<IconPlus />} onClick={openAddModal} variant="primary" size="small">
            添加成员
          </Button>
        )}
      </div>

      <p className={rootClass.elem("description").toClassName()}>
        管理项目成员和角色。管理员可以配置成员、调整角色并移除成员；标注员和审核员在这里仅可查看。
      </p>

      <div className={rootClass.elem("table-wrapper").toClassName()}>
        <table className={rootClass.elem("table").toClassName()}>
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>加入时间</th>
              {canManageMembers && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={canManageMembers ? 5 : 4} style={{ textAlign: "center", padding: 24, color: "#999" }}>
                  暂无成员。
                </td>
              </tr>
            )}

            {members.map((member) => (
              <tr key={member.id}>
                <td>{getDisplayName(member)}</td>
                <td>{member.email}</td>
                <td>
                  {canManageMembers ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value)}
                      className={rootClass.elem("role-select").toClassName()}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[member.role] || member.role
                  )}
                </td>
                <td>{new Date(member.created_at).toLocaleDateString("zh-CN")}</td>
                {canManageMembers && (
                  <td>
                    <Button size="small" variant="negative" onClick={() => handleRemove(member)}>
                      移除
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

MembersSettings.title = "成员";
MembersSettings.path = "/members";
