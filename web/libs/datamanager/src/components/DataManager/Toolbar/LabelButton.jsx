import { inject } from "mobx-react";
import { Button, ButtonGroup, Dropdown } from "@humansignal/ui";
import { IconChevronDown } from "@humansignal/icons";
import { Interface } from "../../Common/Interface";
import { Menu } from "../../Common/Menu/Menu";
import { dmUserStorageKey } from "../../../utils/dm-user-storage";

const injector = inject(({ store }) => {
  const { dataStore, currentView } = store;
  const totalTasks = store.project?.task_count ?? store.project?.task_number ?? 0;
  const foundTasks = dataStore?.total ?? 0;

  return {
    store,
    canLabel: totalTasks > 0 || foundTasks > 0,
    target: currentView?.target ?? "tasks",
    selectedCount: currentView?.selectedCount ?? 0,
    hasFilters: (currentView?.filtersApplied ?? 0) > 0,
  };
});

export const LabelButton = injector(({ store, canLabel, size, target, selectedCount, hasFilters }) => {
  const disabled = target === "annotations";

  const onLabelAll = () => {
    localStorage.setItem(dmUserStorageKey("dm:labelstream:mode"), "all");
    store.startLabelStream();
  };

  const onLabelVisible = () => {
    localStorage.setItem(dmUserStorageKey("dm:labelstream:mode"), "filtered");
    store.startLabelStream();
  };

  const primaryAction = selectedCount > 0 ? onLabelAll : hasFilters ? onLabelVisible : onLabelAll;
  const primaryLabel =
    selectedCount > 0 ? `标注 ${selectedCount} 条任务` : hasFilters ? "按当前列表筛选标注" : "标注全部任务";

  const menuItems = [];

  if (selectedCount > 0 && hasFilters) {
    menuItems.push({
      key: "filtered",
      label: "按当前列表筛选标注",
      onClick: onLabelVisible,
    });
  }

  if (hasFilters || selectedCount > 0) {
    menuItems.push({
      key: "all",
      label: "标注全部任务",
      onClick: onLabelAll,
    });
  }

  if (!canLabel) return null;

  const primaryButton = (
    <Button
      size={size ?? "small"}
      variant="primary"
      look="outlined"
      disabled={disabled}
      style={
        menuItems.length > 0
          ? { width: 160, padding: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }
          : undefined
      }
      onClick={primaryAction}
    >
      {primaryLabel}
    </Button>
  );

  return (
    <Interface name="labelButton">
      {menuItems.length > 0 ? (
        <ButtonGroup>
          {primaryButton}
          <Dropdown.Trigger
            alignment="bottom-right"
            content={
              <Menu size="compact">
                {menuItems.map((item) => (
                  <Menu.Item key={item.key} onClick={item.onClick}>
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu>
            }
          >
            <Button
              size={size}
              look="outlined"
              variant="primary"
              disabled={disabled}
              aria-label="Toggle open"
              style={{ width: 24, padding: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              <IconChevronDown />
            </Button>
          </Dropdown.Trigger>
        </ButtonGroup>
      ) : (
        primaryButton
      )}
    </Interface>
  );
});
