import { type ChangeEvent, type FormEventHandler, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button, InputFile, ToastType, useToast, Userpic } from "@humansignal/ui";
import { getApiInstance } from "@humansignal/core";
import styles from "../AccountSettings.module.css";
import { useAuth } from "@humansignal/core/providers/AuthProvider";
import { atomWithMutation } from "jotai-tanstack-query";
import { useAtomValue } from "jotai";

/**
 * FIXME: This is legacy imports. We're not supposed to use such statements
 * each one of these eventually has to be migrated to core or ui
 */
import { Input } from "apps/labelstudio/src/components/Form/Elements";

const formatErrorMessage = (payload: unknown): string => {
  if (!payload) return "账号信息更新失败";
  if (typeof payload === "string") return payload;

  if (typeof payload === "object") {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;

    const messages = Object.values(payload as Record<string, unknown>)
      .flatMap((value) => {
        if (Array.isArray(value)) return value;
        return [value];
      })
      .map((value) => String(value))
      .filter(Boolean);

    if (messages.length > 0) return messages.join("；");
  }

  return "账号信息更新失败";
};

const updateUserAvatarAtom = atomWithMutation(() => ({
  mutationKey: ["update-user"],
  async mutationFn({
    userId,
    body,
    isDelete,
  }: { userId: number; body: FormData; isDelete?: never } | { userId: number; isDelete: true; body?: never }) {
    const api = getApiInstance();
    const method = isDelete ? "deleteUserAvatar" : "updateUserAvatar";

    return await api.invoke(
      method,
      { pk: userId },
      {
        body,
        headers: {
          "Content-Type": "multipart/form-data",
        },
        errorFilter: () => true,
      },
    );
  },
}));

export const PersonalInfo = () => {
  const toast = useToast();
  const { user, refetch: refetchUser, isLoading: userInProgress, update: updateUser } = useAuth();
  const updateUserAvatar = useAtomValue(updateUserAvatarAtom);
  const [isInProgress, setIsInProgress] = useState(false);
  const [username, setUsername] = useState(user?.username ?? "");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange: FormEventHandler<HTMLInputElement> = useCallback(
    async (event) => {
      if (!user) return;

      const input = event.currentTarget;
      const body = new FormData();
      body.append("avatar", input.files?.[0] ?? "");

      const response = await updateUserAvatar.mutateAsync({
        body,
        userId: user.id,
      });

      if (!response.$meta.ok) {
        toast?.show({ message: response?.response?.detail ?? "头像更新失败", type: ToastType.error });
      } else {
        refetchUser();
      }

      input.value = "";
    },
    [refetchUser, toast, updateUserAvatar, user],
  );

  const deleteUserAvatar = useCallback(async () => {
    if (!user) return;

    await updateUserAvatar.mutateAsync({ userId: user.id, isDelete: true });
    refetchUser();
  }, [refetchUser, updateUserAvatar, user]);

  const handleSubmit: FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault();
      if (!user) return;

      const payload: Record<string, string> = {
        username,
        first_name: firstName,
        last_name: lastName,
        phone,
      };

      if (currentPassword || newPassword || newPasswordConfirm) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
        payload.new_password_confirm = newPasswordConfirm;
      }

      const response = await updateUser(payload);
      refetchUser();

      if (!response?.$meta.ok) {
        toast?.show({ message: formatErrorMessage(response?.response), type: ToastType.error });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      toast?.show({ message: "账号信息已保存", type: ToastType.info });
    },
    [
      currentPassword,
      firstName,
      lastName,
      newPassword,
      newPasswordConfirm,
      phone,
      refetchUser,
      toast,
      updateUser,
      user,
      username,
    ],
  );

  const bindValue =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.currentTarget.value);
    };

  useEffect(() => {
    setIsInProgress(userInProgress);
  }, [userInProgress]);

  useEffect(() => {
    setUsername(user?.username ?? "");
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
    setPhone(user?.phone ?? "");
  }, [user]);

  return (
    <div className={styles.section} id="personal-info">
      <div className={styles.sectionContent}>
        <div className={styles.flexRow}>
          <Userpic user={user} isInProgress={userInProgress} size={92} style={{ flex: "none" }} />
          <form className={styles.flex1}>
            <InputFile
              name="avatar"
              onChange={handleAvatarChange}
              accept="image/png, image/jpeg, image/jpg"
              ref={avatarRef}
            />
          </form>
          {user?.avatar && (
            <Button type="submit" variant="negative" look="outlined" size="medium" onClick={deleteUserAvatar}>
              删除头像
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className={styles.sectionContent}>
          <div className={styles.flexRow}>
            <div className={styles.flex1}>
              <Input label="用户名" value={username} onChange={bindValue(setUsername)} name="username" />
            </div>
            <div className={styles.flex1}>
              <Input label="邮箱" type="email" readOnly value={user?.email ?? ""} />
            </div>
          </div>

          <div className={styles.flexRow}>
            <div className={styles.flex1}>
              <Input label="名" value={firstName} onChange={bindValue(setFirstName)} name="first_name" />
            </div>
            <div className={styles.flex1}>
              <Input label="姓" value={lastName} onChange={bindValue(setLastName)} name="last_name" />
            </div>
          </div>

          <div className={styles.flexRow}>
            <div className={styles.flex1}>
              <Input label="电话" type="tel" onChange={bindValue(setPhone)} value={phone} name="phone" />
            </div>
            <div className={styles.flex1} />
          </div>

          <div className={styles.flexRow}>
            <div className={styles.flex1}>
              <Input
                label="当前密码"
                type="password"
                value={currentPassword}
                onChange={bindValue(setCurrentPassword)}
                name="current_password"
                description="如需修改密码，请先输入当前密码。"
              />
            </div>
            <div className={styles.flex1}>
              <Input
                label="新密码"
                type="password"
                value={newPassword}
                onChange={bindValue(setNewPassword)}
                name="new_password"
                description="至少 8 位；留空则不修改密码。"
              />
            </div>
          </div>

          <div className={styles.flexRow}>
            <div className={styles.flex1}>
              <Input
                label="确认新密码"
                type="password"
                value={newPasswordConfirm}
                onChange={bindValue(setNewPasswordConfirm)}
                name="new_password_confirm"
              />
            </div>
            <div className={styles.flex1} />
          </div>

          <div className={clsx(styles.flexRow, styles.flexEnd)}>
            <Button style={{ width: 125 }} waiting={isInProgress}>
              保存
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
