# Nông trại 2.5D

Web game nông trại thế giới mở với đồ hoạ **cozy vẽ tay** — nét mực nâu quanh
mọi vật thể, màu pastel, vân giấy phủ toàn khung hình — trên nền camera sau lưng
xoay tự do, kèm hệ thống bắt và giao việc cho pet kiểu Palworld.

**Trạng thái: POC chơi đơn, đã chạy được trọn vòng lặp.** Multiplayer chưa làm —
xem [Lộ trình multiplayer](#lộ-trình-multiplayer).

## Chạy thử

```bash
npm install
npm run dev      # http://localhost:3000
```

Không cần cấu hình gì thêm. Không có Firebase thì game tự lưu vào `localStorage`.

## Điều khiển

Việc đồng áng làm **bằng một cú bấm chuột** vào ô: rê chuột qua là ô sáng lên
kèm tên việc, bấm là làm. Ô nào đang cần mình thì có **biểu tượng nổi** trên
đó — 💧 cây khát, liềm cây chín — nhìn ruộng là biết chỗ nào cần tới; bấm vào
biểu tượng hay bấm vào ô đều được.

- **Sáng vàng** — ô có việc và nhân vật với tới. Bấm là làm.
- **Sáng đỏ** — đúng thứ đó, nhưng ngoài tầm với (2.6 ô, bóng thì 3.2). Đi lại
  gần thì tự chuyển vàng, chuột không cần nhúc nhích. Biểu tượng ngoài tầm
  cũng mờ đi.
- **Không sáng** — ô đó không có việc. Bấm không có gì xảy ra.

Mỗi ô chỉ có đúng một việc, suy ra từ trạng thái của chính nó:

| Trạng thái ô | Việc | Cần cầm |
|---|---|---|
| Luống trống | TRỒNG — mở túi hạt, chọn loại là gieo xuống ô đó | — |
| Cây đang lớn, đất khô | TƯỚI (💧 nổi trên ô) | — |
| Cây đã chín | THU HOẠCH (liềm nổi trên ô) | — |
| Cây / bụi / đá | CHẶT | rìu |
| Pet hoang | BẮT | bóng |
| Luống hoặc bãi đang xây | DỠ BỎ | 🗑️ (ô cuối) |
| Cây đang lớn và đất còn ẩm | *không có việc* | — |

Chỉ ba việc cần cầm dụng cụ (phím `1`–`4` hoặc bấm ô nhanh), và đó là những
việc mà cùng một ô có thể hiểu hai cách: cầm 🗑️ thì luống trống là "thứ để dỡ"
chứ không phải "chỗ để gieo", cầm bóng thì con trỏ nhắm pet chứ không nhắm
đất. Rìu chỉ *thêm* việc chặt, không che việc của đất — cầm rìu vẫn tưới và
thu được. Không có bình tưới, túi hạt hay liềm trong hotbar; nhân vật tự rút
đúng đạo cụ ra khi diễn.

Không có cuốc: **luống đất chỉ đến từ xây dựng** (xem bên dưới). Ô cuối của cột
dụng cụ là **🗑️ dỡ bỏ**, cố định — không kéo đi, không thả đè, không gỡ. Cầm nó
rồi rê qua luống hay bãi đang xây dở là sáng lên; bấm thì hỏi lại trước khi dỡ,
vì cây trên luống và công sức đã xây không lấy lại được. Chỉ công trình xây từ
bảng xây dựng mới dỡ được (`removable` trong `data/buildings.ts`); nhà chính thì
không.

Bong bóng tên việc hiện trên mục tiêu, mờ đi khi đúng ngữ cảnh nhưng thiếu tài
nguyên (hết hạt); bấm lúc đó sẽ nói rõ thiếu gì thay vì im lặng.

Không có chỉ số sức hay nước: hành động không tốn gì, bình tưới không bao giờ
cạn. Cái giá của mọi việc là **thời gian đứng làm** (xem xây dựng bên dưới) —
một loại chi phí duy nhất, dễ đọc hơn hai thanh phải để mắt canh.

| Phím | Tác dụng |
|---|---|
| Chuột trái | **Dùng dụng cụ lên thứ dưới con trỏ** |
| `WASD` / mũi tên | Di chuyển **theo hướng camera** |
| Giữ chuột phải + rê | Xoay camera quanh nhân vật |
| `Q` / `E` | Xoay camera bằng bàn phím |
| Cuộn chuột | Kéo camera xa / gần |
| `Shift` | Chạy |
| `1`–`4` | Cầm dụng cụ ở cột ô nhanh; bấm lại để buông ra |
| `F` | Xây công trình đã đặt, khi đứng cạnh nó |
| `B` | Bảng xây dựng |
| `I` | Ba lô |
| `Tab` | Bảng pet |
| `Esc` | Đóng bảng đang mở |

Camera hạ thấp để ngắm cảnh, nâng cao (tới 72°) khi cần nhìn rõ ô để bấm.

## Ba lô và cột ô nhanh

Góc dưới trái là avatar nhân vật, ngay trên nó là
**cột bốn ô dụng cụ nhanh** ứng với phím `1`–`4` — cột dọc không tranh chỗ với
bong bóng hành động ở giữa khung hình. Bấm ô để cầm, bấm lại ô đang chọn để
**buông ra tay không** (tay không vẫn gieo / tưới / thu được). Kéo ô này thả
vào ô kia để đổi chỗ. Ô 4 luôn là 🗑️ dỡ bỏ.
Bấm avatar hoặc phím `I` để mở ba lô, chia tab *Tất cả / Dụng cụ / Hạt giống /
Nông sản / Vật liệu*.

Ba lô là **lưới ô vuông 56px chỉ hiện biểu tượng**, khung thông tin nằm bên
phải. Mọi kích thước chốt cứng ở CSS chứ không để nội dung quyết định: 6 cột
cố định, luôn đủ 30 ô kể cả khi ba lô rỗng, `scrollbar-gutter: stable` chừa sẵn
chỗ cho thanh cuộn, khung bên phải giữ nguyên bề ngang khi chưa chọn gì. Nhờ
vậy đổi tab hay nhặt thêm đồ đều không làm bảng co giãn — mắt người chơi nhớ
được vị trí từng món, và không có cú nhảy nào lúc thanh cuộn xuất hiện.

Chọn ô bằng `WASD`: `A`/`D` đi theo thứ tự món (hết dòng thì sang dòng sau),
`W`/`S` nhảy đúng một hàng. Chặn `A`/`D` ở mép dòng thì hàng cuối khuyết ô sẽ
có món không cách nào tới được, mà chạm tới mọi món mới là việc của lưới này.
`Q`/`E` đổi tab, `Enter` cầm món đang chọn lên.

Ba lô mở thì bàn phím thuộc về UI: `Input.captured` cắt `moveAxis` và
`justPressed` ngay ở nguồn (trừ `Esc` và `I`), nên không có chuyện nhân vật
chạy sau lưng bảng đang mở. Chặn ở một chỗ, không rải `if (uiOpen)` khắp
Engine.

**Chỉ dụng cụ đặt được vào ô nhanh.** Hạt giống và nông sản đi theo *hành động*
chứ không theo thứ đang cầm, nên một ô "hạt cà rốt" sẽ không có nghĩa gì. Kéo
được mọi thứ ra khỏi ba lô nhưng thả nhầm thì ô nhanh từ chối kèm lời giải
thích — khoá ngay ở chỗ cầm lên thì người chơi chỉ thấy giao diện đơ, không học
được luật. Chuột phải lên một ô để gỡ dụng cụ ra.

## Xây dựng: đặt xuống rồi tới làm

Nhà chính đứng ở tâm đảo, là điểm xuất phát. Quanh nhà có **vòng tròn mờ bán
kính 12 ô** — chỉ trong đó mới đặt được công trình. Bấm `B` mở bảng xây dựng,
chọn một loại, rồi bấm vào ô đất trống trong vòng: một bãi cọc-dây hiện ra ở
đó. Đặt bao nhiêu bãi tuỳ ý, `Esc` để thôi đặt. Mới chỉ có một loại: **luống
đất** — xây xong thì ô đó thành luống đã xới, gieo hạt lên được.

Đặt xuống là tức thì và miễn phí; công sức nằm ở chỗ **phải tới và đứng làm**.
Cơ chế này dùng chung cho mọi công trình về sau, nên ghi rõ ở đây:

- Mỗi loại công trình có **`workload`** — khối lượng công việc cần hoàn thành
  (`data/buildings.ts`; luống đất là 20).
- Người chơi có chỉ số **`work`**, mặc định 10: mỗi giây đứng xây trừ đi 10
  workload. Luống đất mất 2 giây. Chỉ số này để sau nâng cấp (dụng cụ tốt hơn,
  pet phụ việc) mà không đụng vào số liệu từng công trình.
- Đứng cạnh bãi (trong tầm với 2.6 ô) thì trên bãi hiện `Ⓕ Xây luống đất`. Bấm
  `F` là nhân vật quay mặt về bãi, chạy animation đóng cọc, và bong bóng đổi
  thành thanh tiến độ.
- **Di chuyển, bấm chuột, hay đổi dụng cụ là dừng ngay.** Tiến độ giữ nguyên
  trong `tile.site.done`; quay lại bấm `F` là làm tiếp từ chỗ dở, kể cả sau khi
  tắt game (bãi và tiến độ nằm trong save).
- Đủ workload thì `Engine.finishBuild` đổi trạng thái ô theo loại công trình và
  xoá bãi. Thêm công trình mới = thêm một mục vào `BUILDINGS` và một nhánh trong
  `finishBuild`; phần đặt, hiện bong bóng, đếm tiến độ, lưu/khôi phục không phải
  viết lại.

Ô có bãi thì chỉ 🗑️ tác động được (dụng cụ khác rê qua không sáng), nên không
có chuyện tưới hay gieo đè lên bãi đang xây dở.

## Gieo hạt: mỗi cú bấm một ô

Bấm vào luống trống là **túi hạt** mở ở góc dưới phải, liệt kê các loại hạt
đang có; chọn một loại là gieo xuống đúng ô vừa bấm rồi túi đóng lại. Esc hay
✕ thì đóng mà không gieo. Mỗi ô một lần mở — muốn xen canh thì chọn khác đi
ở ô kế.

Gieo vẫn đi qua `FarmActions.perform` như mọi việc khác, nên luật đủ hạt / ô
hợp lệ chỉ nằm ở một chỗ.

Vòng lặp chơi: **xây luống → gieo hạt → tưới → thu hoạch → bán → mua hạt tốt hơn.**
Cây khô vẫn lớn nhưng chậm 3 lần, nên tưới là việc đáng làm chứ không bắt buộc.

Bắt pet: cầm bóng, rê chuột lên pet hoang — nét mực của nó chuyển vàng khi
trong tầm ném — rồi bấm. Bóng nhắm vào *con pet* chứ không vào ô dưới chân nó,
nên không ném hụt vào chỗ trống. Pet hoang chỉ bỏ chạy khi bạn cầm bóng. Ném
trượt thì pet mệt đi, lần sau dễ bắt hơn. Bắt được rồi thì vào bảng pet (`Tab`)
giao việc — pet sẽ tự đi tưới / thu hoạch / nhặt gỗ mà không cần bạn.

## Stack

- **Nuxt 4** ở chế độ SPA (`ssr: false`) — game cần WebGL, SSR không đem lại gì.
- **Tailwind 4** qua plugin Vite, chỉ dùng cho HUD.
- **three.js** — camera phối cảnh quỹ đạo sau lưng, đảo tròn phẳng giữa biển, vòm
  trời gradient, và phong cách vẽ tay dựng từ ba thành phần: viền mực vỏ-lộn-ngược,
  ramp toon 2 bậc (mảng sáng phẳng + mảng bóng), và vân giấy ở tầng CSS.
- **Firebase** (tuỳ chọn) — Auth ẩn danh + Firestore để lưu cloud.

## Kiến trúc

Nguyên tắc chính: **engine không biết gì về Vue, Vue không biết gì về three.js.**

```
app/game/                 ← TypeScript thuần, không import 'vue'
├── core/
│   ├── Engine.ts         Điểm nối duy nhất giữa UI và gameplay
│   ├── EventBus.ts       Engine emit → Vue lắng nghe (xem ghi chú bên dưới)
│   ├── Input.ts          Gom input thô, không biết luật chơi
│   ├── Time.ts           Đồng hồ thế giới, chu kỳ ngày/đêm
│   └── rng.ts            PRNG có seed + value noise
├── world/
│   ├── Grid.ts           Lưới tile — nguồn sự thật duy nhất về địa hình
│   └── Heightmap.ts      Sinh đảo tròn phẳng; độ cao lưu theo GÓC ô nên bờ không nứt
├── render/               Tầng three.js, chỉ đọc Grid rồi vẽ
│   ├── SceneManager.ts   Ánh sáng, sương mù, các InstancedMesh
│   ├── CameraRig.ts      Camera quỹ đạo — nguồn sự thật cho HƯỚNG di chuyển
│   ├── TerrainMesh.ts    Địa hình + mặt nước, nướng thành mesh vertex-color
│   ├── Outline.ts        Viền mực — vỏ lộn ngược, dùng chung cho mesh & instanced
│   ├── Sky.ts            Vòm trời gradient đổi màu theo giờ
│   ├── GrassField.ts     Thảm cỏ instanced, gió tính trong vertex shader
│   └── models/           Model dựng bằng code, không có file asset nào
├── entities/Player.ts
├── systems/              Luật chơi
│   ├── FarmActions.ts    "Dùng dụng cụ X lên ô Y" — pet dùng chung luật này
│   ├── CropSystem.ts     Sinh trưởng theo thời gian
│   ├── PetSystem.ts      Máy trạng thái AI + giao việc
│   └── CatchSystem.ts    Ném bóng bắt pet
├── data/                 Bảng số liệu cây trồng, pet, công trình (workload)
└── save/                 Firestore + localStorage
```

### Vì sao UI không bind thẳng vào state engine

`useGameStore` **chép** dữ liệu từ engine sang ref của Vue mỗi khi có event, thay
vì bọc `reactive()` quanh state engine. Engine ghi toạ độ nhân vật 60 lần/giây;
nếu để Vue theo dõi, mỗi lần ghi sẽ kích hoạt effect và tụt khung hình.

### Ba thành phần tạo nên phong cách vẽ tay

Không có file texture nào; toàn bộ vẻ "vẽ tay" đến từ ba thứ rời nhau:

1. **Viền mực** ([Outline.ts](app/game/render/Outline.ts)) — vẽ lại vật thể phình
   ra dọc pháp tuyến, chỉ hiện mặt sau. Cho nét dày đều tuyệt đối như nét bút,
   trong khi hậu kỳ dò biên depth/normal lại cho nét mảnh dần khi vật ở xa.
2. **Ramp toon 2 bậc** ([Materials.ts](app/game/render/Materials.ts)) — bề mặt
   chỉ có đúng hai mức sáng, nên hình khối đọc ra nhờ NÉT chứ không nhờ chuyển
   sáng. Ánh sáng môi trường được đẩy cao và mặt trời hạ thấp để củng cố điều đó.
3. **Vân giấy** ([main.css](app/assets/css/main.css)) — nhiễu `feTurbulence` nhân
   đè lên khung hình ở tầng CSS, phá vỡ những mảng màu phẳng tuyệt đối của đồ
   hoạ 3D. Không tốn gì của pipeline WebGL.

Luống đất cố ý là **đĩa bầu dục chồng mép nhau** chứ không phải ô vuông — lưới
vuông đều tăm tắp là thứ lộ ra ngay rằng đây là đồ hoạ máy tính.

### Vì sao không có file model nào

Toàn bộ cây, đá, pet, nhân vật, và 5 loại cây trồng × 5 giai đoạn đều dựng bằng
code từ Box/Cone/Icosahedron. Đổi một tham số trong `data/` là ra loài mới, không
cần mở Blender. Đây là lựa chọn có chủ đích cho giai đoạn POC — khi cần chất
lượng cao hơn thì thay `render/models/*` bằng glTF mà không đụng gameplay.

## Thêm nội dung mới

**Thêm cây trồng** — thêm một entry vào `app/game/data/crops.ts`. Hết. Model,
giai đoạn sinh trưởng, mục trong cửa hàng, nút chọn hạt đều tự sinh ra.

**Thêm loài pet** — thêm entry vào `app/game/data/pets.ts`. Trường `skills` quyết
định pet nhận được nghề nào.

**Thêm nghề cho pet** — thêm một nhánh vào `tileNeedsJob()` và `completeWork()`
trong `PetSystem.ts`, rồi thêm nhãn vào `JOB_LABEL` ở `PetPanel.vue`.

## Firebase (tuỳ chọn)

```bash
cp .env.example .env    # rồi điền key từ Firebase Console
firebase deploy --only firestore:rules
```

Bật **Anonymous Authentication** và **Cloud Firestore**. Game tự phát hiện: thiếu
biến môi trường thì chạy localStorage, có thì lưu cả hai và bản nào mới hơn thắng.

`firestore.rules` đã mở sẵn quyền đọc nông trại của người khác cho tài khoản đã
đăng nhập — đó là nền cho phần multiplayer.

## Lộ trình multiplayer

Thiết kế nhắm tới multiplayer **bất đồng bộ kiểu thăm nhà** (giúp tưới nước,
trộm cây) chứ không phải MMO đồng bộ vị trí. Vì vậy Firestore là đủ và **không
cần server game riêng**:

1. Lưu nông trại dưới `farms/{uid}` — đã xong.
2. Danh sách bạn bè + màn hình chọn nông trại để ghé thăm.
3. Chế độ khách: tải snapshot của chủ nhà ở dạng chỉ-đọc, khách chỉ được `create`
   vào `farms/{uid}/visits/*` (tưới giúp một ô, hoặc nhổ trộm một cây).
4. Chủ nhà vào game thì đọc hàng `visits`, kiểm tra tính hợp lệ phía client rồi
   áp dụng. Vì khách không ghi trực tiếp lên state chủ, cheat tệ nhất chỉ là
   spam — chặn bằng rate limit trong rules.
5. Trường `Crop.stolenBy` đã có sẵn trong kiểu dữ liệu để đánh dấu cây bị trộm.

Nếu sau này thực sự cần đồng bộ vị trí thời gian thực (<20 người), điểm cần thay
là `SceneManager.entityLayer` + một `RemotePlayerSystem` mới; toàn bộ luật chơi
trong `systems/` dùng lại được nguyên vẹn.

## Khi dev bị tự tải lại trang

Vite tải lại trang vì nhiều lý do và không phải lý do nào cũng in ra rõ ràng.
Dự án đã chặn sẵn hai nguyên nhân phổ biến nhất trong `nuxt.config.ts`:

- `optimizeDeps.include` khai báo trước `three` và `firebase/*`. Nếu để Vite tự
  phát hiện lúc chạy, mỗi lần phát hiện là một dòng `new dependencies optimized`
  kèm một cú full reload giữa lúc đang chơi.
- `devtools: { enabled: false }`. Nuxt DevTools nạp `@vue/devtools-core/kit`
  lúc chạy và gây ra đúng vấn đề trên.

Nguyên nhân thường gặp nhất còn lại **không phải lỗi**: Nuxt khởi động lại dev
server mỗi khi `nuxt.config.ts`, `.env`, `app.config.ts` hoặc file trong
`modules/` thay đổi, và mọi trình duyệt đang mở đều bị tải lại theo. Trên
terminal sẽ thấy `nuxt.config.ts updated. Restarting Nuxt...` ngay trước đó.

Nếu vẫn bị, mở console: [`app/plugins/reload-logger.client.ts`](app/plugins/reload-logger.client.ts)
sẽ in ra trang vừa tải lại sau bao lâu và vì sao. Nó ghi lý do vào
`sessionStorage` *trước* khi reload, nên lý do vẫn đọc được sau khi console đã
bị xoá.

Tiến độ **không mất** khi bị tải lại: `beforeunload` ghi snapshot vào
localStorage ngay trước khi trang đóng, và chuyển tab cũng kích hoạt lưu. Cái
mất đi chỉ là vị trí camera và ~1 giây tải lại.

## Việc còn thiếu

- Chưa có âm thanh.
- Chưa có điều khiển cảm ứng cho điện thoại (HUD đã responsive, input thì chưa).
- Pet đi theo đường thẳng, chỉ né vật cản một bước — đủ cho đồng trống, sẽ kẹt
  nếu sau này có mê cung. Cần A* thì thay `PetSystem.steer()`.
- Chưa có hệ thống nhân giống pet và chiến đấu.
