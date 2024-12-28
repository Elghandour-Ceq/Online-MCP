import { execa } from "execa"
import { platform } from "os"
interface NotificationOptions {
	title?: string
	subtitle?: string
	message: string
}
async function showMacOSNotification(options: NotificationOptions): Promise<void> {
	const { title, subtitle = "", message } = options
	const script = `display notification "${message}" with title "${title}" subtitle "${subtitle}" sound name "Tink"`
	try {
		await execa("osascript", ["-e", script])
	} catch (error) {
		throw new Error(`Failed to show macOS notification: ${error}`)
	}
}
async function showWindowsNotification(options: NotificationOptions): Promise<void> {
	const { title, message } = options
	const duration = 6 // seconds
	const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $balloon.BalloonTipTitle = '${title}'
    $balloon.BalloonTipText = '${message}'
    $balloon.Visible = $true
    $balloon.ShowBalloonTip(${duration * 1000})
    Start-Sleep -Seconds ${duration}
    $balloon.Visible = $false
    $balloon.Dispose()
  `
	try {
		await execa("powershell", ["-Command", script])
	} catch (error) {
		throw new Error(`Failed to show Windows notification: ${error}`)
	}
}
export async function showSystemNotification(options: NotificationOptions): Promise<void> {
	try {
		const { title = "Cline", message } = options
		if (!message) {
			throw new Error("Message is required")
		}
		switch (platform()) {
			case "darwin":
				await showMacOSNotification({ ...options, title })
				break
			case "win32":
				await showWindowsNotification({ ...options, title })
				break
			default:
				throw new Error("Unsupported platform")
		}
	} catch (error) {
		console.error("Could not show system notification", error)
	}
}