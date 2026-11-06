import AppKit
let out = CommandLine.arguments[1]

let root = CommandLine.arguments[2]
func c(_ r: CGFloat,_ g: CGFloat,_ b: CGFloat,_ a: CGFloat = 1) throws -> Data {
  try NSKeyedArchiver.archivedData(withRootObject: NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a), requiringSecureCoding: false)
}
let font = NSFont(name: "Iosevka-Medium", size: 14) ?? NSFont.monospacedSystemFont(ofSize: 14, weight: .medium)
var p: [String: Any] = [
  "name": "Undertow", "type": "Window Settings", "ProfileCurrentVersion": 2.09,
  "BackgroundColor": try c(11,22,72,1.0),
  "TextColor": try c(255,255,255), "TextBoldColor": try c(255,255,255),
  "CursorColor": try c(232,16,30), "SelectionColor": try c(255,255,255,0.35),
  "Font": try NSKeyedArchiver.archivedData(withRootObject: font, requiringSecureCoding: false),
  "BackgroundBlur": 0.0, "BackgroundBlurInactive": 0.0, "BackgroundSettingsForInactiveWindows": false,
  "BackgroundImageBookmark": try NSKeyedArchiver.archivedData(withRootObject: NSMutableData(data: URL(fileURLWithPath: root + "/ghostty/background.png").bookmarkData()), requiringSecureCoding: false),
  "columnCount": 170, "rowCount": 50, "FontAntialias": true, "useOptionAsMetaKey": true,
  "shellExitAction": 1, "ShowWindowSettingsNameInTitle": true, "ShowActiveProcessInTitle": false, "ShowActiveProcessArgumentsInTitle": false, "ShowCommandKeyInTitle": false, "ShowDimensionsInTitle": false, "ShowRepresentedURLInTitle": false, "ShowRepresentedURLPathInTitle": false, "ShowShellCommandInTitle": false, "ShowTTYNameInTitle": false,
]
do {
  // Terminal runs this through a shell: quoted, so a space or quote in the folder's path stays part of the path.
  p["CommandString"] = "'" + (root + "/terminal/launch.zsh").replacingOccurrences(of: "'", with: "'\\''") + "'"
  p["RunCommandAsShell"] = true
}
try PropertyListSerialization.data(fromPropertyList: p, format: .xml, options: 0).write(to: URL(fileURLWithPath: out))

