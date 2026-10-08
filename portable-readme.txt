王者直播信息屏 · King Live Panel 1.0.2 正式便携版

运行方式
1. 将 ZIP 完整解压到 E 盘、D 盘或其他可写入的非 C 盘文件夹。
2. 双击 King Live Panel.exe。无需安装，无需 Node.js。
3. 请保留整个文件夹内的 DLL、resources、locales 等文件，不要单独移动 EXE。
4. 不要直接在压缩软件中运行 EXE，以免压缩软件解压到系统临时目录。

应用数据均保存在 EXE 旁边的 data 文件夹：
data\panel-config.json  分路状态、布局与心率设置
data\cache\             网页缓存、Cookie、本地存储及心率网页独立数据
data\temp\              应用临时文件
data\logs\              应用日志
data\crash-dumps\       崩溃转储目录
data\app-data\          子进程应用数据

搬迁或备份时复制整个程序文件夹，配置会随 data 一起保留。
如果程序目录无法写入，会提示并退出，不会回退到 C 盘。

在控制台点击“使用说明”查看直播捕获、布局和心率设置方法。
在“心率连接”开启“仅读取网页数字”，再点击“保存并加载”，即可保留默认白色爱心，仅同步网页心率数字。
关闭控制台即退出程序。
