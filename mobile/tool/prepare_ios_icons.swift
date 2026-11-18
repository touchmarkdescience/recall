import AppKit
import ImageIO
import UniformTypeIdentifiers

// Preserve Recall's existing artwork and sizes, filling transparent corners
// with the icon's own green background. App Store PNGs must have no alpha.
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let catalog = root.appendingPathComponent("ios/Runner/Assets.xcassets/AppIcon.appiconset")
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: catalog.appendingPathComponent("Contents.json"))) as! [String: Any]
let names = Set((manifest["images"] as! [[String: Any]]).compactMap { $0["filename"] as? String })
let master = NSBitmapImageRep(data: try Data(contentsOf: catalog.appendingPathComponent("Icon-App-1024x1024@1x.png")))!
let background = master.colorAt(x: master.pixelsWide / 2, y: 0)!.usingColorSpace(.deviceRGB)!
guard background.alphaComponent > 0.999 else { fatalError("Expected an opaque brand-color sample") }

for name in names.sorted() {
    let url = catalog.appendingPathComponent(name)
    let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
    let original = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(data: nil, width: original.width, height: original.height,
        bitsPerComponent: 8, bytesPerRow: original.width * 4, space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.setFillColor(red: background.redComponent, green: background.greenComponent,
        blue: background.blueComponent, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: original.width, height: original.height))
    context.draw(original, in: CGRect(x: 0, y: 0, width: original.width, height: original.height))
    let image = context.makeImage()!
    let output = NSMutableData()
    let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("PNG encoding failed: \(name)") }
    try (output as Data).write(to: url, options: .atomic)
    print("Opaque PNG: \(name) (\(original.width)x\(original.height))")
}
