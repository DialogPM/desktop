// Menus that adapt to the device: popover menus on desktop, bottom sheets on phones.

import { Box, Drawer, Menu } from "@mantine/core";
import { cloneElement, useState, type ReactElement, type ReactNode } from "react";
import { useIsMobile } from "../lib/hooks";

export interface MenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  color?: string;
  onClick: () => void;
  hidden?: boolean;
  dividerBefore?: boolean;
}

interface SheetProps {
  opened: boolean;
  onClose: () => void;
  actions: MenuAction[];
  title?: ReactNode;
  header?: ReactNode;
}

export function ActionSheet({ opened, onClose, actions, title, header }: SheetProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      withCloseButton={false}
      classNames={{ content: "action-sheet" }}
      styles={{ content: { height: "auto", width: "100%", maxHeight: "85dvh", flex: "0 0 auto" }, inner: { alignItems: "flex-end" } }}
    >
      <div className="sheet-handle" />
      {title && <div className="sheet-title truncate">{title}</div>}
      {header && <Box px="sm" pb="sm">{header}</Box>}
      <div>
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <button
              type="button"
              key={a.key}
              className="sheet-item"
              data-danger={a.color === "red"}
              onClick={() => {
                onClose();
                a.onClick();
              }}
            >
              <span className="sheet-icon">{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
      </div>
    </Drawer>
  );
}

function MenuItems({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions
        .filter((a) => !a.hidden)
        .map((a) => [
          a.dividerBefore ? <Menu.Divider key={`${a.key}-div`} /> : null,
          <Menu.Item key={a.key} leftSection={a.icon} color={a.color} onClick={a.onClick}>
            {a.label}
          </Menu.Item>,
        ])}
    </>
  );
}

interface AdaptiveMenuProps {
  target: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  actions: MenuAction[];
  title?: ReactNode;
  position?: "bottom-end" | "bottom-start" | "top-end" | "top-start";
}

/** A menu attached to a button. */
export function AdaptiveMenu({ target, actions, title, position = "bottom-end" }: AdaptiveMenuProps) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (mobile) {
    return (
      <>
        {cloneElement(target, {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            setOpen(true);
          },
        })}
        <ActionSheet opened={open} onClose={() => setOpen(false)} actions={actions} title={title} />
      </>
    );
  }
  return (
    <Menu position={position} shadow="md" width={240} withinPortal>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <MenuItems actions={actions} />
      </Menu.Dropdown>
    </Menu>
  );
}

interface ContextMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: MenuAction[];
  header?: ReactNode;
  title?: ReactNode;
}

/** A menu opened at a pointer position (right click / long press). */
export function ContextMenu({ position, onClose, actions, header, title }: ContextMenuProps) {
  const mobile = useIsMobile();
  if (mobile) {
    return <ActionSheet opened={!!position} onClose={onClose} actions={actions} header={header} title={title} />;
  }
  return (
    <Menu
      opened={!!position}
      onChange={(o) => !o && onClose()}
      position="bottom-start"
      shadow="lg"
      width={250}
      withinPortal
      closeOnItemClick
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            left: position?.x ?? 0,
            top: position?.y ?? 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {header && <Box p={4}>{header}</Box>}
        {header && <Menu.Divider />}
        <MenuItems actions={actions} />
      </Menu.Dropdown>
    </Menu>
  );
}
