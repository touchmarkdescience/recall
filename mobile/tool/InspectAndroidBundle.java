import com.android.aapt.Resources;
import com.android.bundle.Config;
import java.util.*;
import java.util.zip.ZipFile;

// Uses the Android build's cached protobuf descriptors; reads the actual AAB,
// not a potentially stale external merged manifest. No signing secrets needed.
class InspectAndroidBundle {
  static String quote(String s) {return "\""+s.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
  static String attr(Resources.XmlElement element,String name) {
    for (var a:element.getAttributeList()) if(a.getName().equals(name)) {
      if(!a.getValue().isEmpty())return a.getValue();
      if(a.hasCompiledItem()) {
        var p=a.getCompiledItem().getPrim();
        if(p.hasIntDecimalValue())return Integer.toString(p.getIntDecimalValue());
        if(p.hasBooleanValue())return Boolean.toString(p.getBooleanValue());
      }
    }
    return "";
  }
  public static void main(String[] args)throws Exception {
    try(var zip=new ZipFile(args[0])) {
      var manifest=Resources.XmlNode.parseFrom(zip.getInputStream(zip.getEntry("base/manifest/AndroidManifest.xml"))).getElement();
      var config=Config.BundleConfig.parseFrom(zip.getInputStream(zip.getEntry("BundleConfig.pb")));
      var data=new LinkedHashMap<String,String>();
      data.put("package",attr(manifest,"package"));
      data.put("versionName",attr(manifest,"versionName"));
      data.put("versionCode",attr(manifest,"versionCode"));
      data.put("bundlePageAlignment",config.getOptimizations().getUncompressNativeLibraries().getAlignment().name());
      for(var node:manifest.getChildList())if(node.hasElement()) {
        var element=node.getElement();
        if(element.getName().equals("uses-sdk")) {
          data.put("minSdk",attr(element,"minSdkVersion"));data.put("targetSdk",attr(element,"targetSdkVersion"));
        }
        if(element.getName().equals("application")) {
          data.put("debuggable",attr(element,"debuggable"));data.put("allowBackup",attr(element,"allowBackup"));
          for(var child:element.getChildList())if(child.hasElement()) {
            var receiver=child.getElement();
            if(receiver.getName().equals("receiver")&&attr(receiver,"name").equals("com.dexterous.flutterlocalnotifications.ActionBroadcastReceiver"))
              data.put("notificationActionReceiverExported",attr(receiver,"exported"));
          }
        }
      }
      var fields=new ArrayList<String>();
      for(var e:data.entrySet())fields.add(quote(e.getKey())+":"+quote(e.getValue()));
      System.out.println("{"+String.join(",",fields)+"}");
    }
  }
}
