param([string]$Src, [string]$OutDir)
# Logo JPG -> şeffaf PNG'ler. Koyuluk = saydamlık; renk = logonun ölçülen mürekkep rengi.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class LogoTool {
  static byte[] Read(Bitmap b, out int stride){ var d=b.LockBits(new Rectangle(0,0,b.Width,b.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb); stride=d.Stride; var a=new byte[stride*b.Height]; Marshal.Copy(d.Scan0,a,0,a.Length); b.UnlockBits(d); return a; }
  // En koyu %1'lik piksellerin ortalaması = mürekkep rengi
  public static int[] Ink(Bitmap b){ int s; var p=Read(b,out s); long r=0,g=0,bl=0,n=0;
    for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){int i=y*s+x*4; int L=(p[i]+p[i+1]+p[i+2])/3; if(L<110){bl+=p[i];g+=p[i+1];r+=p[i+2];n++;}}
    return new int[]{(int)(r/n),(int)(g/n),(int)(bl/n),(int)n}; }
  // Bölge içinde, saydamlaştırılmış ve kırpılmış PNG
  public static int[] Cut(Bitmap b, Rectangle region, int ir,int ig,int ib, string path, int pad){
    int s; var p=Read(b,out s); int inkL=(ir+ig+ib)/3; double bgL=246;
    int minX=int.MaxValue,minY=int.MaxValue,maxX=-1,maxY=-1;
    var alpha=new byte[region.Width*region.Height];
    for(int y=0;y<region.Height;y++)for(int x=0;x<region.Width;x++){
      int i=(region.Y+y)*s+(region.X+x)*4; double L=(p[i]+p[i+1]+p[i+2])/3.0;
      double a=(bgL-L)/(bgL-inkL); if(a<0.06)a=0; if(a>1)a=1; byte A=(byte)Math.Round(a*255);
      alpha[y*region.Width+x]=A; if(A>40){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; } }
    minX=Math.Max(0,minX-pad); minY=Math.Max(0,minY-pad); maxX=Math.Min(region.Width-1,maxX+pad); maxY=Math.Min(region.Height-1,maxY+pad);
    int w=maxX-minX+1,h=maxY-minY+1; var o=new Bitmap(w,h,PixelFormat.Format32bppArgb);
    var d=o.LockBits(new Rectangle(0,0,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb); var q=new byte[d.Stride*h];
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){int j=y*d.Stride+x*4; q[j]=(byte)ib;q[j+1]=(byte)ig;q[j+2]=(byte)ir;q[j+3]=alpha[(minY+y)*region.Width+(minX+x)];}
    Marshal.Copy(q,0,d.Scan0,q.Length); o.UnlockBits(d); o.Save(path,ImageFormat.Png); o.Dispose();
    return new int[]{region.X+minX,region.Y+minY,w,h}; }
  // Satır satır mürekkep var mı (bölümleri bulmak için)
  public static string Rows(Bitmap b){ int s; var p=Read(b,out s); var sb=new System.Text.StringBuilder(); bool on=false; int start=0;
    for(int y=0;y<b.Height;y++){ bool has=false; for(int x=0;x<b.Width;x++){int i=y*s+x*4; if((p[i]+p[i+1]+p[i+2])/3<170){has=true;break;}}
      if(has&&!on){on=true;start=y;} if(!has&&on){on=false; sb.Append(start+"-"+(y-1)+" ");} } return sb.ToString(); }
}
"@
$bmp = [System.Drawing.Bitmap]::FromFile($Src)
"size: $($bmp.Width)x$($bmp.Height)"
$ink = [LogoTool]::Ink($bmp); "ink: rgb($($ink[0]),$($ink[1]),$($ink[2])) n=$($ink[3]) hex=#{0:X2}{1:X2}{2:X2}" -f $ink[0],$ink[1],$ink[2]
"rows: " + [LogoTool]::Rows($bmp)
New-Item -ItemType Directory -Force $OutDir | Out-Null
$W=$bmp.Width; $H=$bmp.Height
# Tam logo: monogram + ENGLISH + with Kawthar (Instagram satırı hariç)
$r1 = [LogoTool]::Cut($bmp, (New-Object System.Drawing.Rectangle 0,0,$W,750), $ink[0],$ink[1],$ink[2], "$OutDir\logo.png", 6); "logo.png: " + ($r1 -join ",")
# Sadece K monogramı (kıvrım + kalp dahil)
$r2 = [LogoTool]::Cut($bmp, (New-Object System.Drawing.Rectangle 0,0,$W,530), $ink[0],$ink[1],$ink[2], "$OutDir\monogram.png", 6); "monogram.png: " + ($r2 -join ",")
$bmp.Dispose()
