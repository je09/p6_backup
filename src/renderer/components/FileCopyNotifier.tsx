import { useEffect } from "react";
import { useSnackbar } from "../context/SnackbarContext";

/**
 * Surfaces file-copy progress from the main process as snackbars.
 *
 * This lives once, above the tabs. Backup and Restore both used to listen on
 * this channel, which was only safe while a single tab was mounted at a time:
 * each cleaned up with removeAllListeners, so either one unmounting would have
 * silenced the other, and both being mounted would have doubled every message.
 */
export const FileCopyNotifier: React.FC = () => {
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    window.electronAPI.onFileCopySuccess((data: { message: string }) =>
      showSnackbar(data.message, "info")
    );
    return () => window.electronAPI.removeAllListeners("file-copy-success");
  }, [showSnackbar]);

  return null;
};
