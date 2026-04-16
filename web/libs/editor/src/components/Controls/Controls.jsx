import { inject, observer } from "mobx-react";
import { CheckCircleOutlined, CheckOutlined } from "@ant-design/icons";

import Hint from "../Hint/Hint";
import { DraftPanel } from "../Annotations/Annotations";
import styles from "./Controls.module.css";
import { Button, Tooltip } from "@humansignal/ui";
import { IconInfoOutline } from "@humansignal/icons";
import { cn } from "../../utils/bem";

export default inject("store")(
  observer(({ item, store }) => {
    /**
     * Buttons of Controls
     */
    const buttons = {
      skip: "",
      update: "",
      submit: "",
    };

    const { userGenerate, sentUserGenerate, versions } = item;
    const { enableHotkeys, enableTooltips } = store.settings;

    /**
     * Task information
     */
    let taskInformation;
    const taskInfoClassName = cn("task-info").toClassName();
    const skipButtonClassName = cn("skip-btn").toClassName();
    const submitButtonClassName = cn("submit-btn").toClassName();
    const updateButtonClassName = cn("update-btn").toClassName();

    if (store.task) {
      taskInformation = <h4 className={`${styles.task} ${taskInfoClassName}`}>Task ID: {store.task.id}</h4>;
    }

    /**
     * Hotkeys
     */
    if (enableHotkeys && enableTooltips) {
      buttons.submit = <Hint> [ Ctrl+Enter ]</Hint>;
      buttons.skip = <Hint> [ Ctrl+Space ]</Hint>;
      buttons.update = <Hint> [ Alt+Enter] </Hint>;
    }

    let skipButton;
    let updateButton;
    let submitButton;
    let draftMenu;

    /**
     * Check for Predict Menu
     */
    // Manager roles that can force-skip unskippable tasks (OW=Owner, AD=Admin, MA=Manager)
    const MANAGER_ROLES = ["OW", "AD", "MA"];

    if (!store.annotationStore.predictSelect || store.explore) {
      const disabled = store.isSubmitting;
      const task = store.task;
      const isEnterprise = window.APP_SETTINGS?.billing?.enterprise;
      const skipDisabled = isEnterprise ? task?.allow_skip === false : false;
      const userRole = window.APP_SETTINGS?.user?.role;
      const hasForceSkipPermission = MANAGER_ROLES.includes(userRole);
      const canSkip = !skipDisabled || hasForceSkipPermission;
      const skipButtonDisabled = disabled || !canSkip;

      const skipTooltip = canSkip ? "跳过任务 [ Ctrl+Space ]" : "此任务不可跳过";

      const showInfoIcon = skipButtonDisabled && hasForceSkipPermission;

      if (store.hasInterface("skip")) {
        const isReviewApprove = store.hasInterface("review-approve");
        skipButton = (
          <>
            {showInfoIcon && !isReviewApprove && (
              <Tooltip title="标注员与审核员将无法跳过此任务">
                <IconInfoOutline width={20} height={20} className="text-neutral-content ml-auto cursor-pointer" />
              </Tooltip>
            )}
            <Button
              disabled={isReviewApprove ? disabled : skipButtonDisabled}
              look="danger"
              onClick={isReviewApprove || canSkip ? store.skipTask : undefined}
              tooltip={isReviewApprove ? "驳回该条标注" : skipTooltip}
              className={`${styles.skip} ${skipButtonClassName}`}
            >
              {isReviewApprove ? "驳回" : "跳过"}
              {!isReviewApprove && buttons.skip}
            </Button>
          </>
        );
      }

      if ((userGenerate && !sentUserGenerate) || (store.explore && !userGenerate && store.hasInterface("submit"))) {
        submitButton = (
          <Button
            disabled={disabled}
            look="primary"
            icon={<CheckOutlined />}
            onClick={store.submitAnnotation}
            tooltip="保存结果 [ Ctrl+Enter ]"
            className={`${styles.submit} ${submitButtonClassName}`}
          >
            提交 {buttons.submit}
          </Button>
        );
      }

      const canUpdateReview = (userGenerate && sentUserGenerate) || (!userGenerate && store.hasInterface("update"));

      if (store.hasInterface("review-approve")) {
        updateButton = (
          <>
            <Button
              disabled={disabled}
              look="primary"
              icon={<CheckOutlined />}
              onClick={store.acceptAnnotation}
              tooltip="无需修改，直接通过审核 [ Ctrl+Enter ]"
              className={`${styles.submit} ${submitButtonClassName}`}
            >
              直接通过 {buttons.submit}
            </Button>
            {canUpdateReview && (
              <Button
                disabled={disabled}
                look="outlined"
                icon={<CheckCircleOutlined />}
                onClick={store.updateAnnotation}
                tooltip="保存您对标注的修改后再通过审核"
                className={updateButtonClassName}
              >
                保存修改并通过 {buttons.update}
              </Button>
            )}
          </>
        );
      } else if ((userGenerate && sentUserGenerate) || (!userGenerate && store.hasInterface("update"))) {
        updateButton = (
          <Button
            disabled={disabled}
            look="primary"
            icon={<CheckCircleOutlined />}
            onClick={store.updateAnnotation}
            tooltip="更新任务 [ Alt+Enter ]"
            className={updateButtonClassName}
          >
            {sentUserGenerate || versions.result ? "更新" : "提交"} {buttons.update}
          </Button>
        );
      }

      if (!store.hasInterface("annotations:menu")) {
        draftMenu = <DraftPanel item={item} />;
      }
    }

    const content = (
      <div className={styles.block}>
        <div className={styles.wrapper}>
          <div className={styles.container}>
            {skipButton}
            {updateButton}
            {submitButton}
            {draftMenu}
          </div>
          {taskInformation}
        </div>
      </div>
    );

    return (item.type === "annotation" || store.explore) && content;
  }),
);
