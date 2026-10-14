import { Center, Loader } from "@mantine/core";
import { useEffect } from "react";
import { startAppLockWatcher, useAppLock } from "./lib/appLock";
import { MainLayout } from "./features/layout/MainLayout";
import { DataLockScreen } from "./features/lock/DataLockScreen";
import { LockScreen } from "./features/lock/LockScreen";
import { Onboarding } from "./features/onboarding/Onboarding";
import { SetupScreen } from "./features/onboarding/SetupScreen";
import { useSetup } from "./lib/setup";
import { bootstrap } from "./store/actions";
import { useApp } from "./store/app";
import { startEventBridge } from "./store/events";
import { startRemoteWipeWatcher } from "./lib/remoteWipe";

export function App() {
  const appState = useApp((s) => s.appState);
  const locked = useAppLock((s) => s.locked);
  const setupPending = useSetup((s) => s.pending);

  useEffect(() => {
    const stop = startEventBridge();
    const stopLock = startAppLockWatcher();
    const stopWipe = startRemoteWipeWatcher();
    void bootstrap();
    return () => {
      stop();
      stopLock();
      stopWipe();
    };
  }, []);

  if (!appState) {
    return (
      <Center h="100dvh" style={{ background: "var(--canvas)" }}>
        <Loader />
      </Center>
    );
  }
  if (appState.status === "locked") return <DataLockScreen mode="unlock" />;
  if (appState.status !== "ready") return <Onboarding defaultServer={appState.default_server_url} />;
  if (appState.account && appState.pending_mnemonic?.length) {
    // Account created but the recovery phrase was never confirmed: show it again.
    return (
      <Onboarding
        defaultServer={appState.default_server_url}
        resume={{ account: appState.account, mnemonic: appState.pending_mnemonic }}
      />
    );
  }
  // Linked device or data from an older version: lock it with the password first.
  if (!appState.local_protected) return <DataLockScreen mode="protect" />;
  // A new account: name, username and appearance first.
  if (appState.account && setupPending.includes(appState.account.account_id)) return <SetupScreen accountId={appState.account.account_id} />;
  // While locked nothing of the session is rendered underneath.
  return locked ? <LockScreen /> : <MainLayout />;
}
