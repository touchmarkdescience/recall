// Reproducible Play feature graphic using Recall's existing icon; no generated logo.
import AppKit
let args = CommandLine.arguments
let root = URL(fileURLWithPath: args.count > 1 ? args[1] : ".")
let output = root.appendingPathComponent("release/assets/feature-graphic.png")
let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil, pixelsWide:1024, pixelsHigh:500, bitsPerSample:8, samplesPerPixel:4, hasAlpha:true, isPlanar:false, colorSpaceName:.deviceRGB, bytesPerRow:0, bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
let context = NSGraphicsContext(bitmapImageRep:bitmap)!
NSGraphicsContext.current = context
NSColor(calibratedRed:0.969,green:0.980,blue:0.953,alpha:1).setFill()
NSBezierPath(rect:NSRect(x:0,y:0,width:1024,height:500)).fill()
NSColor(calibratedRed:0.88,green:0.94,blue:0.89,alpha:1).setFill()
NSBezierPath(ovalIn:NSRect(x:735,y:-100,width:500,height:650)).fill()
let ink = NSColor(calibratedRed:0.07,green:0.23,blue:0.19,alpha:1)
func text(_ string:String, _ x:CGFloat, _ y:CGFloat, _ size:CGFloat, _ weight:NSFont.Weight = .regular, _ color:NSColor? = nil) {
 (string as NSString).draw(at:NSPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:color ?? ink])
}
NSImage(contentsOf:root.appendingPathComponent("assets/recall-icon.png"))!.draw(in:NSRect(x:68,y:360,width:66,height:66))
text("Recall",150,365,43,.bold)
text("Remember",68,253,60,.bold)
text("every promise.",68,184,60,.bold)
text("Voice notes. Follow-ups. Reminders.",71,119,23)
text("Free to use.",72,59,18,.semibold)
NSColor(calibratedRed:0.08,green:0.30,blue:0.25,alpha:1).setFill()
NSBezierPath(ovalIn:NSRect(x:783,y:157,width:146,height:146)).fill()
NSColor(calibratedRed:0.94,green:0.77,blue:0.37,alpha:1).setStroke()
let ring=NSBezierPath(ovalIn:NSRect(x:776,y:150,width:160,height:160));ring.lineWidth=5;ring.stroke()
NSColor.white.setFill()
NSBezierPath(roundedRect:NSRect(x:842,y:215,width:28,height:59),xRadius:14,yRadius:14).fill()
NSColor.white.setStroke()
let stand=NSBezierPath();stand.lineWidth=6;stand.lineCapStyle = .round
stand.move(to:NSPoint(x:833,y:239));stand.line(to:NSPoint(x:833,y:227))
stand.curve(to:NSPoint(x:879,y:227),controlPoint1:NSPoint(x:833,y:194),controlPoint2:NSPoint(x:879,y:194))
stand.line(to:NSPoint(x:879,y:239));stand.stroke()
let foot=NSBezierPath();foot.lineWidth=6;foot.lineCapStyle = .round
foot.move(to:NSPoint(x:856,y:203));foot.line(to:NSPoint(x:856,y:187));foot.move(to:NSPoint(x:843,y:187));foot.line(to:NSPoint(x:869,y:187));foot.stroke()
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using:.png,properties:[:])!.write(to:output)
// Flatten to opaque RGB for Play's feature-graphic requirement.
let jpeg = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".jpg")
for arguments in [["-s","format","jpeg",output.path,"--out",jpeg.path],["-s","format","png",jpeg.path,"--out",output.path]] {
 let process=Process(); process.executableURL=URL(fileURLWithPath:"/usr/bin/sips");process.arguments=arguments;process.standardOutput=FileHandle.nullDevice
 try process.run();process.waitUntilExit();precondition(process.terminationStatus == 0)
}
try FileManager.default.removeItem(at:jpeg)
print(output.path)
