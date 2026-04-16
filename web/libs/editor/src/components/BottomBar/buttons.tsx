/**
 * Buttons for the bottom bar. Defined separately so the logic code is more readable.
 * Also they can be reused in custom buttons.
 * `on*OnComment()` are used for actions with comment attached to them.
 */

import { inject, observer } from "mobx-react";
import type React from "react";
import { memo, type ReactElement } from "react";
import { Tooltip, Button } from "@humansignal/ui";
import { IconInfoOutline } from "@humansignal/icons";
import type { MSTStore } from "../../stores/types";
import { FF_FIT_1304_STRICT_OVERLAP, isFF } from "../../utils/feature-flags";
import { INCOMPLETE_ACCEPT_TOOLTIP } from "./Controls";

type MixedInParams = {
  store: MSTStore;
  history: any;
};

export function controlsInjector<T extends {}>(fn: (props: T & MixedInParams) => ReactElement) {
  const wrapped = inject(({ store }) => {
    return {
      store,
      history: store?.annotationStore?.selected?.history,
    };
  })(fn);
  // inject type doesn't handle the injected props, so we have to force cast it
  return wrapped as unknown as (props: T) => ReactElement;
}

type ButtonTooltipProps = {
  title: string;
  children: JSX.Element;
  className?: string;
};

export const ButtonTooltip = controlsInjector<ButtonTooltipProps>(
  observer(({ store, title, children, className }) => {
    return (
      <Tooltip title={title} disabled={!store.settings.enableTooltips} className={className}>
        {children}
      </Tooltip>
    );
  }),
);

type AcceptButtonProps = {
  disabled: boolean;
  history: any;
  store: MSTStore;
};

type AdoptButtonProps = {
  disabled: boolean;
  store: MSTStore;
};

export const AcceptButton = memo(
  observer(({ disabled, history, store }: AcceptButtonProps) => {
    const annotation = store.annotationStore.selected;
    // changes in current sessions or saved draft
    const hasChanges = history.canUndo || annotation.versions.draft;
    const hasIncompleteRegions = annotation.hasIncompletePolygons;
    const isDisabled = disabled || hasIncompleteRegions;
    const tooltip = hasIncompleteRegions ? INCOMPLETE_ACCEPT_TOOLTIP : "通过审核 [ Ctrl+Enter ]";

    return (
      <Tooltip title={tooltip} disabled={!store.settings.enableTooltips} className="whitespace-nowrap max-w-none">
        <Button
          key="accept"
          aria-label="通过标注"
          disabled={isDisabled}
          onClick={async () => {
            annotation.submissionInProgress();
            await store.commentStore.commentFormSubmit();
            store.acceptAnnotation();
          }}
          data-testid="bottombar-accept-button"
        >
          {hasChanges ? "修改后通过" : "通过"}
        </Button>
      </Tooltip>
    );
  }),
);

export const AdoptButton = memo(
  observer(({ disabled, store }: AdoptButtonProps) => {
    const annotation = store.annotationStore.selected;
    const hasIncompleteRegions = annotation.hasIncompletePolygons;
    const isDisabled = disabled || hasIncompleteRegions || annotation.ground_truth === true;
    const tooltip = hasIncompleteRegions
      ? INCOMPLETE_ACCEPT_TOOLTIP
      : annotation.ground_truth === true
        ? "当前结果已被采纳"
        : "采纳当前结果为最终结果";

    return (
      <Tooltip title={tooltip} disabled={!store.settings.enableTooltips} className="whitespace-nowrap max-w-none">
        <Button
          key="adopt"
          aria-label="采纳当前标注"
          disabled={isDisabled}
          look="outlined"
          onClick={async () => {
            annotation.submissionInProgress();
            await store.commentStore.commentFormSubmit();
            annotation.setGroundTruth(true);
          }}
          data-testid="bottombar-adopt-button"
        >
          {annotation.ground_truth === true ? "已采纳" : "采纳"}
        </Button>
      </Tooltip>
    );
  }),
);

export const RejectButtonDefinition = {
  id: "reject",
  name: "reject",
  title: "驳回",
  variant: "negative",
  look: "outlined",
  ariaLabel: "驳回标注",
  tooltip: "驳回标注 [ Ctrl+Space ]",
  // @todo we need this for types compatibility, but better to fix CustomButtonType
  disabled: false,
};

type SkipButtonProps = {
  disabled: boolean;
  store: MSTStore;
  /**
   * Handler wrapper for skip with required comment,
   * conditions are checked in wrapper and if all good the `action` is called.
   **/
  onSkipWithComment: (event: React.MouseEvent, action: () => any) => void;
};

// Manager roles that can force-skip unskippable tasks (OW=Owner, AD=Admin, MA=Manager)
const MANAGER_ROLES = ["OW", "AD", "MA"];

export const SkipButton = memo(
  observer(({ disabled, store, onSkipWithComment }: SkipButtonProps) => {
    const task = store.task;
    const isEnterprise = (window as any).APP_SETTINGS?.billing?.enterprise;
    const skipDisabled = isEnterprise ? (task as any)?.allow_skip === false : false;
    const userRole = (window as any).APP_SETTINGS?.user?.role;
    const hasForceSkipPermission = MANAGER_ROLES.includes(userRole);
    const canSkip = !skipDisabled || hasForceSkipPermission;
    // Only check overlap reached when feature flag is enabled
    const overlapReached = isFF(FF_FIT_1304_STRICT_OVERLAP) && store.overlapReached === true;
    const isDisabled = disabled || !canSkip || overlapReached;

    const tooltip: string = overlapReached
      ? store.overlapReachedMessage
      : canSkip
        ? "跳过任务 [ Ctrl+Space ]"
        : "此任务不可跳过";

    const showInfoIcon = skipDisabled && hasForceSkipPermission;

    return (
      <>
        {showInfoIcon && (
          <Tooltip title="标注员与审核员将无法跳过此任务">
            <IconInfoOutline width={20} height={20} className="text-neutral-content ml-auto cursor-pointer" />
          </Tooltip>
        )}
        <Button
          key="skip"
          aria-label="跳过当前任务"
          disabled={isDisabled}
          look="outlined"
          tooltip={tooltip}
          onClick={async (e) => {
            if (!canSkip) return;
            const action = () => store.skipTask({});
            const selected = store.annotationStore?.selected;
            if (store.hasInterface("comments:skip") ?? true) {
              onSkipWithComment(e, action);
            } else {
              selected?.submissionInProgress();
              await store.commentStore.commentFormSubmit();
              store.skipTask({});
            }
          }}
          data-testid="bottombar-skip-button"
        >
          跳过
        </Button>
      </>
    );
  }),
);

export const UnskipButton = memo(
  observer(({ disabled, store }: { disabled: boolean; store: MSTStore }) => {
    return (
      <Button
        key="cancel-skip"
        tooltip="取消跳过"
        aria-label="取消跳过并返回标注"
        look="outlined"
        disabled={disabled}
        onClick={async () => {
          const selected = store.annotationStore?.selected;

          selected?.submissionInProgress();
          await store.commentStore.commentFormSubmit();
          store.unskipTask();
        }}
        data-testid="bottombar-unskip-button"
      >
        取消跳过
      </Button>
    );
  }),
);
