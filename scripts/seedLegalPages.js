/**
 * Loads the client Privacy and Terms copy into global settings.
 * Pages read these keys from the API. Re-running replaces the four keys.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const GlobalSetting = require("../db/models/GlobalSetting");

const HELP = "/SupportTicketsC";
const PRIVACY = "/privacy-policy";

const sec = (inner) => `<div class="lg-sec">${inner}</div>`;
const h2 = (eyebrow, title) => `<h2 class="lg-h2"><span class="lg-eyebrow">${eyebrow}</span>${title}</h2>`;
const p = (text) => `<p class="lg-p">${text}</p>`;
const quote = (text) => `<p class="lg-quote">${text}</p>`;
const h3 = (text) => `<p class="lg-h3">${text}</p>`;
const list = (items) => `<ul class="lg-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
const defs = (items) => `<div class="lg-defs">${items.map((item) => `<span>${item}</span>`).join("")}</div>`;
const page = (sections) => sections.join("");

const privacyMn = page([
  sec(p(`Энэхүү Нууцлалын бодлогоор Бонди Солюшнс ХХК (“Bondy”) нь платформ, вебсайт болон аппликейшн ашиглах үед таны мэдээллийг хэрхэн цуглуулж, ашиглаж, хадгалж, хамгаалдаг талаар тайлбарлана. Bondy нь Монгол Улсын Хүний хувийн мэдээлэл хамгаалах тухай хууль болон холбогдох хууль тогтоомжийг баримтална.`)),
  sec(
    h2("1", "Мэдээлэл хариуцагч") +
    p("Бонди Солюшнс ХХК<br />Улаанбаатар, Монгол Улс") +
    p(`Нууцлал болон хувийн мэдээлэлтэй холбоотой хүсэлтийг Bondy-ийн <a href="${HELP}">Тусламжийн төв</a>өөр дамжуулан илгээж болно.`),
  ),
  sec(
    h2("2", "Ямар мэдээлэл цуглуулдаг вэ?") +
    h3("Хэрэглэгчээс:") +
    list(["Нэр, овог", "Имэйл хаяг", "Утасны дугаар", "Профайлын мэдээлэл", "Захиалга, бүртгэл, тасалбарын мэдээлэл", "Төлбөрийн төлөв, гүйлгээ болон буцаан олголтын мэдээлэл", "Дуртай жагсаалт, дагасан зохион байгуулагч, хайлт болон платформ ашигласан мэдээлэл", "Тусламжийн хүсэлт болон үйлчилгээтэй холбоотой харилцааны мэдээлэл"]) +
    h3("Зохион байгуулагчаас:") +
    list(["Нэр болон байгууллагын мэдээлэл", "Имэйл, утасны дугаар", "Баталгаажуулалтад өгсөн иргэний үнэмлэх эсвэл жолооны үнэмлэхийн мэдээлэл", "Орлого хүлээн авах банкны дансны мэдээлэл", "Эвент, сургалт, борлуулалт, бүртгэл, орлого болон татан авалтын мэдээлэл"]) +
    h3("Техникийн мэдээлэл:") +
    list(["IP хаяг", "Төхөөрөмж, үйлдлийн систем, хөтчийн мэдээлэл", "Веб болон апп ашигласан мэдээлэл", "Алдаа болон аюулгүй байдлын бүртгэл", "Байршлын зөвшөөрөл өгсөн тохиолдолд байршлын мэдээлэл"]) +
    h3("Төлбөрийн тухай:") +
    quote("Bondy нь төлбөрийн нууц мэдээллийг өөр дээрээ хадгалахгүй. Төлбөрийг QPay болон холбогдох банк, санхүүгийн үйлчилгээ үзүүлэгчээр дамжуулан боловсруулна."),
  ),
  sec(
    h2("3", "Мэдээллийг ямар зорилгоор ашигладаг вэ?") +
    list(["Бүртгэл үүсгэх, нэвтрэх болон хэрэглэгчийг баталгаажуулах", "Эвент, сургалтын захиалга болон бүртгэлийг боловсруулах", "Төлбөр, буцаан олголт, татан авалт болон eBarimt-тэй холбоотой үйл ажиллагааг гүйцэтгэх", "QR тасалбар үүсгэх, шалгах болон ирц бүртгэх", "Зохион байгуулагчийг баталгаажуулах", "Хэрэглэгчийн сонирхолд нийцсэн эвент, сургалт санал болгох", "Захиалга, төлбөр болон үйлчилгээтэй холбоотой мэдэгдэл хүргэх", "Тусламжийн хүсэлт болон маргааныг шийдвэрлэх", "Луйвар, хууль бус ашиглалтаас сэргийлэх", "Үйлчилгээний найдвартай ажиллагаа болон хэрэглэгчийн туршлагыг сайжруулах"]) +
    p("Мэдээллийг хууль, гэрээ, үйлчилгээ үзүүлэх шаардлага болон шаардлагатай тохиолдолд хэрэглэгчийн зөвшөөрөлд үндэслэн боловсруулна."),
  ),
  sec(
    h2("4", "Мэдээллийг хэнтэй хуваалцаж болох вэ?") +
    h3("Зохион байгуулагчтай:") +
    quote("Тухайн захиалга, бүртгэлийг удирдахад шаардлагатай хэмжээнд хэрэглэгчийн нэр, холбоо барих шаардлагатай мэдээлэл, захиалга эсвэл бүртгэлийн мэдээлэл, төлөвийг тухайн зохион байгуулагчид харуулж болно.") +
    h3("Үйлчилгээ үзүүлэгчтэй:") +
    p("Bondy нь үйлчилгээгээ ажиллуулахад шаардлагатай хэмжээнд мэдээллийг дараах төрлийн үйлчилгээ үзүүлэгчид дамжуулж болно:") +
    list(["Банк болон төлбөрийн үйлчилгээ", "eBarimt", "Нэвтрэлт болон баталгаажуулалт", "Газрын зураг, байршлын үйлчилгээ", "Имэйл, мессеж, нэг удаагийн код илгээх үйлчилгээ", "Сервер болон үүлэн дэд бүтэц", "Ашиглалтын шинжилгээ болон алдааны хяналт"]) +
    p("Мөн хуульд заасан тохиолдолд эрх бүхий байгууллагад мэдээлэл өгөх боломжтой.") +
    quote("Bondy нь хэрэглэгчийн хувийн мэдээллийг гуравдагч этгээдэд худалдахгүй."),
  ),
  sec(
    h2("5", "Нийтэд харагдах мэдээлэл") +
    quote("Зохион байгуулагчийн нийтэд нээлттэй профайл, нэр, зураг, эвент, сургалтын мэдээлэл болон өөрөө нийтэд харуулахаар оруулсан мэдээлэл бусад хэрэглэгчдэд харагдаж болно.<br /><br />Харин төлбөр, банкны данс, баталгаажуулалтын баримт бичиг болон хувийн дансны мэдээллийг нийтэд харуулахгүй."),
  ),
  sec(
    h2("6", "Мэдээллийг хэр удаан хадгалах вэ?") +
    quote("Bondy нь мэдээллийг үйлчилгээг үзүүлэхэд шаардлагатай хугацаанд болон хууль, татвар, нягтлан бодох бүртгэл, төлбөр тооцоо, маргаан шийдвэрлэх зэрэг шаардлагын дагуу хадгална.<br /><br />Бүртгэл устгах хүсэлт гаргасан тохиолдолд хуульд заавал хадгалах шаардлагагүй мэдээллийг устгах эсвэл тухайн хэрэглэгчтэй холбох боломжгүй хэлбэрт шилжүүлнэ."),
  ),
  sec(
    h2("7", "Таны эрх") +
    p("Хэрэглэгч дараах эрхтэй:") +
    list(["Өөрийн мэдээллээ харах", "Буруу эсвэл дутуу мэдээллээ засах", "Хуульд нийцүүлэн мэдээллээ устгуулах хүсэлт гаргах", "Өөрийн мэдээллийн хуулбар авах хүсэлт гаргах", "Өгсөн зөвшөөрлөө цуцлах", "Боломжтой тохиолдолд мэдээлэл боловсруулахыг зогсоох хүсэлт гаргах", "Нууцлал болон хувийн мэдээлэлтэй холбоотой гомдол, хүсэлт гаргах"]) +
    quote(`Эдгээр хүсэлтийг Bondy-ийн <a href="${HELP}">Тусламжийн төв</a>өөр дамжуулан илгээнэ үү.`),
  ),
  sec(
    h2("8", "Мэдээллийн аюулгүй байдал") +
    quote("Bondy нь хувийн мэдээллийг зөвшөөрөлгүй нэвтрэх, ашиглах, өөрчлөх, задруулах болон алдагдахаас хамгаалахын тулд зохих техникийн болон зохион байгуулалтын арга хэмжээ авна.<br /><br />Гэхдээ интернет болон цахим системийн аюулгүй байдлыг 100 хувь баталгаажуулах боломжгүй."),
  ),
  sec(
    h2("9", "Аюулгүй байдлын зөрчил") +
    quote("Хувийн мэдээлэлтэй холбоотой аюулгүй байдлын зөрчил гарч, хэрэглэгчийн эрх, хууль ёсны ашиг сонирхолд сөргөөр нөлөөлөх эрсдэлтэй бол Bondy шаардлагатай арга хэмжээ авч, хуульд заасан тохиолдолд холбогдох хэрэглэгчид мэдэгдэнэ."),
  ),
  sec(
    h2("10", "Мэдээллийг Монгол Улсаас гадуур боловсруулах") +
    quote("Bondy-ийн ашигладаг зарим үйлчилгээ үзүүлэгч мэдээллийг Монгол Улсаас гадуур боловсруулах боломжтой. Ийм тохиолдолд мэдээллийг хамгаалахад шаардлагатай арга хэмжээг авна."),
  ),
  sec(
    h2("11", "Нууцлалын бодлогын өөрчлөлт") +
    quote("Энэхүү Нууцлалын бодлогод өөрчлөлт орсон тохиолдолд шинэчилсэн хувилбар болон хүчин төгөлдөр болох огноог энэ хуудсанд нийтэлнэ. Чухал өөрчлөлтийн талаар шаардлагатай тохиолдолд хэрэглэгчид мэдэгдэнэ."),
  ),
  sec(
    h2("12", "Холбоо барих") +
    quote(`Нууцлал болон хувийн мэдээлэлтэй холбоотой хүсэлтээ Bondy-ийн <a href="${HELP}">Тусламжийн төв</a>өөр дамжуулан илгээнэ үү.`) +
    p("Бонди Солюшнс ХХК<br />Улаанбаатар, Монгол Улс"),
  ),
]);

const privacyEn = page([
  sec(p(`This Privacy Policy explains how Bondi Solutions LLC (“Bondy”) collects, uses, stores, and protects your information when you use the platform, website, and application. Bondy follows the Law of Mongolia on the Protection of Personal Information and related legislation.`)),
  sec(
    h2("1", "Data controller") +
    p("Bondi Solutions LLC<br />Ulaanbaatar, Mongolia") +
    p(`Requests about privacy and personal information can be sent through Bondy’s <a href="${HELP}">Help center</a>.`),
  ),
  sec(
    h2("2", "What information do we collect?") +
    h3("From users:") +
    list(["Name", "Email address", "Phone number", "Profile information", "Booking, registration, and ticket information", "Payment status, transactions, and refund information", "Favorites, followed organizers, search, and platform usage", "Support requests and service-related communications"]) +
    h3("From organizers:") +
    list(["Name and organization details", "Email and phone number", "National ID or driver’s license details provided for verification", "Bank account details used to receive payouts", "Event, course, sales, registration, revenue, and withdrawal information"]) +
    h3("Technical information:") +
    list(["IP address", "Device, operating system, and browser information", "Website and app usage", "Error and security logs", "Location, if you allow it"]) +
    h3("About payments:") +
    quote("Bondy does not store payment secrets. Payments are processed through QPay and the relevant banks and financial service providers."),
  ),
  sec(
    h2("3", "Why we use the information") +
    list(["Create an account, sign in, and verify the user", "Process event and course bookings and registrations", "Carry out payments, refunds, withdrawals, and eBarimt", "Create and check QR tickets and record attendance", "Verify organizers", "Recommend events and courses that match a user’s interests", "Send notifications about bookings, payments, and the service", "Resolve support requests and disputes", "Prevent fraud and unlawful use", "Improve reliability and the user experience"]) +
    p("Information is processed on the basis of the law, a contract, the need to provide the service, and, where required, the user’s consent."),
  ),
  sec(
    h2("4", "Who we may share information with") +
    h3("With the organizer:") +
    quote("To the extent needed to manage that booking or registration, the organizer may see the user’s name, the contact details needed to reach them, the booking or registration details, and the status.") +
    h3("With service providers:") +
    p("To the extent needed to operate the service, Bondy may share information with these types of service providers:") +
    list(["Banks and payment services", "eBarimt", "Sign-in and verification", "Maps and location services", "Email, messaging, and one-time codes", "Servers and cloud infrastructure", "Usage analytics and error monitoring"]) +
    p("Information may also be provided to a competent authority where the law requires it.") +
    quote("Bondy does not sell users’ personal information to third parties."),
  ),
  sec(
    h2("5", "Information visible to the public") +
    quote("An organizer’s public profile, name, photo, event and course information, and information they choose to make public may be visible to other users.<br /><br />Payment details, bank accounts, verification documents, and private account information are not shown publicly."),
  ),
  sec(
    h2("6", "How long we keep information") +
    quote("Bondy keeps information for as long as needed to provide the service, and as required for law, tax, accounting, payments, and dispute resolution.<br /><br />If you request account deletion, information the law does not require us to keep is deleted or changed so it can no longer be linked to that user."),
  ),
  sec(
    h2("7", "Your rights") +
    p("You have the right to:") +
    list(["See your information", "Correct inaccurate or incomplete information", "Request deletion in line with the law", "Request a copy of your information", "Withdraw consent you have given", "Request that processing stop, where that is possible", "Submit a complaint or request about privacy and personal information"]) +
    quote(`Send these requests through Bondy’s <a href="${HELP}">Help center</a>.`),
  ),
  sec(
    h2("8", "Information security") +
    quote("Bondy takes appropriate technical and organizational measures to protect personal information from unauthorized access, use, alteration, disclosure, and loss.<br /><br />The security of the internet and electronic systems cannot be guaranteed completely."),
  ),
  sec(
    h2("9", "Security incidents") +
    quote("If a personal-information security incident creates a risk of harm to a user’s rights or legitimate interests, Bondy will take the necessary steps and, where the law requires it, notify the affected users."),
  ),
  sec(
    h2("10", "Processing outside Mongolia") +
    quote("Some service providers Bondy uses may process information outside Mongolia. In that case, Bondy takes the measures needed to protect the information."),
  ),
  sec(
    h2("11", "Changes to this Privacy Policy") +
    quote("If this Privacy Policy changes, the updated version and the date it takes effect will be published on this page. Users will be notified of important changes when necessary."),
  ),
  sec(
    h2("12", "Contact") +
    quote(`Send privacy and personal-information requests through Bondy’s <a href="${HELP}">Help center</a>.`) +
    p("Bondi Solutions LLC<br />Ulaanbaatar, Mongolia"),
  ),
]);

const termsMn = page([
  sec(
    h2("Оршил", "Энэ нөхцөл юуг зохицуулах") +
    quote(`Энэхүү Үйлчилгээний нөхцөл нь Бонди Солюшнс ХХК (“Bondy”) болон Bondy платформ, вебсайт, аппликейшнийг ашиглаж буй хэрэглэгч, зохион байгуулагчийн хооронд үүсэх харилцааны үндсэн нөхцөлийг тогтооно.<br /><br />Та бүртгэл үүсгэх, захиалга эсвэл бүртгэл хийх, зохион байгуулагчаар үйлчилгээ ашиглах үед энэхүү Үйлчилгээний нөхцөл болон <a href="${PRIVACY}">Нууцлалын бодлого</a>той танилцаж, хүлээн зөвшөөрсөн байна.`),
  ),
  sec(
    h2("1", "Нэр томьёо") +
    defs([
      "<b>“Платформ”</b> — Bondy-ийн вебсайт, аппликейшн болон холбогдох цахим үйлчилгээ.",
      "<b>“Хэрэглэгч”</b> — Bondy-ээр дамжуулан эвент, сургалт хайх, захиалах, бүртгүүлэх болон бусад хэрэглэгчийн үйлчилгээ ашиглаж буй этгээд.",
      "<b>“Зохион байгуулагч”</b> — Bondy дээр эвент, сургалт нийтэлж, хэрэглэгчдэд үйлчилгээ үзүүлж буй хувь хүн эсвэл хуулийн этгээд.",
      "<b>“Эвент”</b> — тодорхой огноо, цагт зохион байгуулагдах арга хэмжээ, тоглолт, уулзалт, воркшоп болон бусад нэг удаагийн үйл ажиллагаа.",
      "<b>“Сургалт”</b> — тодорхой эхлэх, дуусах хугацаатай, хөтөлбөрийн дагуу явагдах сургалтын үйлчилгээ.",
      "<b>“Захиалга”</b> — эвентэд оролцох эрх авах үйлдэл.",
      "<b>“Бүртгэл”</b> — сургалтад эсвэл үнэ төлбөргүй үйл ажиллагаанд оролцох эрх баталгаажсан үйлдэл.",
      "<b>“Тасалбар”</b> — тухайн эвентэд оролцох эрхийг баталгаажуулсан цахим тасалбар, QR код.",
    ]),
  ),
  sec(
    h2("2", "Bondy-ийн үүрэг") +
    p("Bondy нь:") +
    list(["Эвент, сургалтын мэдээллийг хайх, үзэх боломж бүрдүүлэх", "Захиалга, бүртгэл хийх цахим системээр хангах", "Төлбөрийн үйлчилгээг холбогдох төлбөрийн үйлчилгээ үзүүлэгчтэй холбох", "Цахим тасалбар болон QR шалгалтын систем ажиллуулах", "Зохион байгуулагчид эвент, сургалт, захиалга, бүртгэлээ удирдах хэрэгслээр хангах", "Зохион байгуулагчийн нийтлэхээр илгээсэн мэдээллийг хянах", "Хэрэглэгч, зохион байгуулагчийн тусламжийн хүсэлтийг хүлээн авах"]) +
    p("Bondy нь эвент, сургалтыг өөрөө зохион байгуулагч биш тохиолдолд тухайн эвент, сургалтын бодит үйлчилгээ үзүүлэгч нь зохион байгуулагч байна.") +
    p("Bondy тухайн мэдээллийг хянаж, нийтэлсэн нь зохион байгуулагчийн үйлчилгээний чанар, аюулгүй байдал, үр дүнг баталгаажуулсан гэсэн утга агуулахгүй."),
  ),
  sec(
    h2("3", "Бүртгэл ба дансны аюулгүй байдал") +
    list(["Бүртгэл үүсгэхдээ үнэн зөв мэдээлэл оруулна.", "Өөрийн нууц үг, баталгаажуулах код болон дансны мэдээллээ бусдад дамжуулахгүй.", "Данс зөвшөөрөлгүй ашиглагдсан гэж үзвэл Bondy-д даруй мэдэгдэнэ.", "Насны хязгаартай эвент, сургалтад оролцохдоо тухайн шаардлагыг хангасан байх үүрэгтэй.", "Шаардлагатай тохиолдолд зохион байгуулагч оролцогчийн нас, иргэний үнэмлэх болон тухайн үйлчилгээнд шаардагдах мэдээллийг шалгаж болно."]),
  ),
  sec(
    h2("4", "Эвент, сургалтын мэдээлэл") +
    p("Зохион байгуулагч нь нийтэлж буй:") +
    list(["нэр", "тайлбар", "зураг, видео", "огноо, цаг", "байршил", "үнэ", "багтаамж", "насны болон оролцооны шаардлага", "цуцлалт, буцаан олголтын нөхцөл"]) +
    p("зэрэг мэдээллийг үнэн зөв, бүрэн байлгах үүрэгтэй.") +
    p("Bondy нь:") +
    list(["дутуу", "төөрөгдүүлсэн", "хууль зөрчсөн", "бусдын эрхийг зөрчсөн", "аюулгүй байдалд эрсдэлтэй"]) +
    p("мэдээллийг нийтлэхээс татгалзах, засвар шаардах эсвэл нийтлэгдсэн мэдээллийг түр хаах эрхтэй.") +
    p("Эвент, сургалт нь Bondy-ийн хяналтад илгээгдэж, баталгаажсаны дараа нийтэд харагдана."),
  ),
  sec(
    h2("5", "Захиалга, бүртгэл ба тасалбар") +
    h3("Төлбөртэй эвент:") +
    list(["Төлбөр амжилттай баталгаажсаны дараа захиалга хүчинтэй болно.", "Тасалбар “Миний захиалга” хэсэгт харагдана."]) +
    h3("Үнэ төлбөргүй эвент:") +
    list(["Багтаамж байгаа тохиолдолд бүртгэл баталгаажна.", "Бүртгүүлсэн хэрэглэгчид QR код олгож болно."]) +
    h3("Сургалт:") +
    list(["Хэрэглэгч сонгосон ангид бүртгүүлнэ.", "Нэг бүртгэл нь тухайн ангид нэг оролцогчийн байр эзэлнэ, хэрэв тухайн саналд өөрөөр заагаагүй бол."]) +
    p("Хэрэглэгч захиалга хийхээс өмнө огноо, цаг, байршил, үнэ, нөхцөлийг шалгах үүрэгтэй."),
  ),
  sec(
    h2("6", "QR тасалбар") +
    list(["QR тасалбар нь тухайн захиалгад зориулсан дахин давтагдашгүй код байна.", "QR кодоо бусдад дамжуулах, хуулбарлах, хууль бусаар ашиглахыг хориглоно.", "Аль хэдийн ашиглагдсан, хүчингүй болсон эсвэл цуцлагдсан QR кодоор нэвтрэх боломжгүй.", "Хэрэглэгч QR кодын нууцлал, аюулгүй байдлыг хамгаална."]),
  ),
  sec(
    h2("7", "Төлбөр") +
    list(["Төлбөрийг Bondy-д холбогдсон QPay, банк болон бусад дэмжигдсэн төлбөрийн сувгаар гүйцэтгэнэ.", "Хэрэглэгч төлбөр баталгаажуулахын өмнө төлөх нийт дүнг харах боломжтой байна.", "Төлбөр амжилтгүй эсвэл баталгаажаагүй бол захиалга баталгаажихгүй байж болно.", "Төлбөртэй холбоотой зарим ажиллагаа тухайн банк, QPay эсвэл бусад төлбөрийн үйлчилгээ үзүүлэгчийн системээс хамаарч болно.", "eBarimt болон төлбөрийн баримтыг холбогдох татвар, гүйлгээний нөхцөлийн дагуу олгоно."]),
  ),
  sec(
    h2("8", "Буцаан олголт ба цуцлалт") +
    p("Эвент, сургалт бүр өөрийн цуцлалт болон буцаан олголтын нөхцөлтэй байж болно.") +
    p("Хэрэглэгч төлбөр төлөхийн өмнө тухайн нөхцөлтэй танилцах боломжтой байна.") +
    h3("Хэрэглэгчийн хүсэлтээр:") +
    list(["Тухайн эвент, сургалтын нийтэлсэн буцаан олголтын нөхцөл зөвшөөрсөн тохиолдолд хүсэлт гаргаж болно.", "Буцаан олголтын боломж, хугацааг тухайн захиалгад үйлчилж буй нөхцөлөөр шийдвэрлэнэ."]) +
    h3("Зохион байгуулагч цуцалсан тохиолдолд:") +
    quote("Зохион байгуулагч эвент эсвэл сургалтыг бүрэн цуцалсан бол тухайн захиалгын төлбөрийг хэрэглэгчид бүрэн буцаан олгоно.") +
    h3("Мэдэгдэхүйц өөрчлөлт:") +
    quote("Эвент, сургалтын огноо, цаг, байршил эсвэл үйлчилгээний үндсэн нөхцөлд зохион байгуулагчийн зүгээс мэдэгдэхүйц өөрчлөлт орж, хэрэглэгч шинэ нөхцөлийг хүлээн зөвшөөрөхгүй бол хууль болон тухайн нөхцөлийн дагуу буцаан олголт хүсэх боломжтой.") +
    p("Буцаан олголт баталгаажсаны дараа Bondy буцаан олголтын ажиллагааг эхлүүлнэ. Дансанд тусах хугацаа банк болон төлбөрийн үйлчилгээ үзүүлэгчээс хамаарч болно.") +
    p("Төлбөртэй захиалга үүссэний дараа зохион байгуулагч тухайн захиалгад үйлчлэх буцаан олголтын нөхцөлийг хэрэглэгчид илүү таагүй байдлаар өөрчлөхгүй."),
  ),
  sec(
    h2("9", "Зохион байгуулагчийн үүрэг") +
    p("Зохион байгуулагч:") +
    list(["Өөрийн болон байгууллагын мэдээллийг үнэн зөв өгөх", "Шаардлагатай баталгаажуулалтад хамрагдах", "Эвент, сургалтыг хуульд нийцүүлэн зохион байгуулах", "Шаардлагатай зөвшөөрөл, лиценз, зохиогчийн болон бусад эрхийг өөрөө хариуцах", "Нийтэлсэн хуваарь, багтаамж, үнэ болон үйлчилгээний нөхцөлийг биелүүлэх", "Өөрчлөлт, хойшлолт, цуцлалтыг Bondy болон оролцогчдод шуурхай мэдэгдэх", "Хэрэглэгчийн мэдээллийг зөвхөн тухайн захиалга, бүртгэлийг удирдах зорилгоор ашиглах", "Хэрэглэгчийн аюулгүй байдал болон үйлчилгээний зохих чанарыг хангах"]) +
    p("үүрэгтэй."),
  ),
  sec(
    h2("10", "Зохион байгуулагчийн орлого, шимтгэл, татан авалт") +
    list(["Bondy-ийн үйлчилгээний шимтгэл болон холбогдох төлбөрийг зохион байгуулагчид урьдчилан эсвэл Organizer Portal дээр тодорхой харуулна.", "Борлуулалтын орлогоос зөвшөөрөгдсөн шимтгэл, буцаан олголт болон холбогдох суутгал хасагдаж болно.", "Татан авалтыг зөвхөн баталгаажсан орлого хүлээн авах данс руу хийнэ.", "Татан авалтын доод хэмжээ, боловсруулах хугацаа болон тухайн үед мөрдөж буй нөхцөлийг Organizer Portal дээр харуулна.", "Маргаан, буцаан олголт, сэжигтэй гүйлгээ эсвэл хууль ёсны шалгалт байгаа үед холбогдох дүнгийн олголтыг шаардлагатай хугацаанд түр хойшлуулж болно."]),
  ),
  sec(
    h2("11", "“Онцлох” сурталчилгаа") +
    p("“Онцлох” нь зохион байгуулагчийн худалдан авч болох төлбөртэй нэмэлт сурталчилгааны байршуулалт байна.") +
    list(["Үнэ болон хугацааг захиалга хийхийн өмнө зохион байгуулагчид харуулна.", "“Онцлох” байршуулалт нь тодорхой борлуулалт, үзэлт, бүртгэл амлахгүй.", "“Онцлох” тэмдэг нь Bondy тухайн эвент, сургалтын чанарыг баталгаажуулсан гэсэн утга агуулахгүй."]),
  ),
  sec(
    h2("12", "Хориглох үйлдэл") +
    p("Дараах үйлдлийг хориглоно:") +
    list(["Худал, төөрөгдүүлсэн мэдээлэл нийтлэх", "Хууран мэхлэх, залилан хийх", "QR код, захиалга, бүртгэлийг хууль бусаар ашиглах", "Бусдын дансанд зөвшөөрөлгүй нэвтрэх", "Платформын ажиллагаанд санаатай саад учруулах", "Хортой код, программ түгээх", "Хууль бус бараа, үйлчилгээ, үйл ажиллагаа сурталчлах", "Бусдын зохиогчийн эрх, барааны тэмдэг болон бусад эрхийг зөрчих", "Ялгаварлан гадуурхсан, хүчирхийлэлд өдөөн турхирсан эсвэл хууль зөрчсөн контент нийтлэх"]) +
    p("Bondy нь ноцтой зөрчил илэрсэн тохиолдолд контентыг устгах, бүртгэлийг хязгаарлах, түр хаах болон хуульд заасан бусад арга хэмжээ авч болно."),
  ),
  sec(
    h2("13", "Оюуны өмч") +
    p("Bondy-ийн:") +
    list(["нэр", "лого", "дизайн", "интерфэйс", "программ хангамж", "платформын бүтэц"]) +
    p("нь Bondy болон холбогдох эрх эзэмшигчийн оюуны өмч байна.") +
    p("Зохион байгуулагч өөрийн оруулсан контентын эрхийг хадгална.") +
    p("Зохион байгуулагч Bondy-д тухайн эвент, сургалтыг платформ дээр харуулах, түгээх, хайлт болон сурталчилгаанд ашиглахад шаардлагатай хэмжээнд уг контентыг ашиглах эрх олгоно.") +
    p("Зохион байгуулагч бусдын контентыг ашиглах эрхтэй гэдгээ өөрөө хариуцна."),
  ),
  sec(
    h2("14", "Гуравдагч талын үйлчилгээ") +
    p("Bondy нь төлбөр, газрын зураг, нэвтрэлт, мессеж болон бусад ажиллагаанд гуравдагч талын үйлчилгээ ашиглаж болно.") +
    p("Тухайн үйлчилгээний системийн тасалдал, саатал нь Bondy-ийн шууд хяналтаас гадуур байж болох бөгөөд Bondy асуудлыг боломжит хэмжээнд шийдвэрлэхээр ажиллана."),
  ),
  sec(
    h2("15", "Үйлчилгээний хүртээмж") +
    p("Bondy нь платформыг найдвартай ажиллуулахыг зорих боловч:") +
    list(["техникийн шинэчлэлт", "засвар үйлчилгээ", "сүлжээний доголдол", "гуравдагч талын үйлчилгээний тасалдал", "Bondy-ийн хяналтаас гадуурх бусад нөхцөл"]) +
    p("үүссэн үед үйлчилгээ түр хугацаанд боломжгүй байж болно."),
  ),
  sec(
    h2("16", "Хариуцлага") +
    p("Bondy нь өөрийн платформ, төлбөрийн холболт болон системийн ажиллагаатай холбоотой хуулиар хүлээсэн үүргээ хэрэгжүүлнэ.") +
    p("Зохион байгуулагч нь:") +
    list(["эвент, сургалтын бодит зохион байгуулалт", "үйлчилгээний агуулга", "зөвшөөрөл", "аюулгүй байдал", "нийтэлсэн мэдээллийн үнэн зөв байдал", "өөрийн үйл ажиллагаанаас үүдэх асуудлыг"]) +
    p("хариуцна.") +
    p("Энэхүү нөхцөл нь Монгол Улсын хуулиар хэрэглэгчид олгосон заавал эдлэх эрхийг хязгаарлахгүй."),
  ),
  sec(
    h2("17", "Бүртгэлийг хязгаарлах, хаах") +
    p("Bondy нь:") +
    list(["энэхүү нөхцөлийг ноцтой эсвэл давтан зөрчсөн", "залилангийн шинжтэй үйлдэл илэрсэн", "платформын аюулгүй байдалд эрсдэл учруулсан", "хууль зөрчсөн"]) +
    p("тохиолдолд бүртгэл эсвэл тодорхой үйлчилгээг түр хязгаарлах, хаах боломжтой.") +
    p(`Хэрэглэгч өөрийн бүртгэлийг устгах хүсэлтийг платформд байгаа боломж эсвэл <a href="${HELP}">Тусламжийн төв</a>өөр дамжуулан гаргаж болно.`),
  ),
  sec(
    h2("18", "Давагдашгүй хүчин зүйл") +
    p("Байгалийн гамшиг, төрийн шийдвэр, өргөн хүрээний сүлжээ болон дэд бүтцийн доголдол, халдлага, хорио цээр болон талуудын боломжит хяналтаас гадуурх бусад нөхцөлийн улмаас үйлчилгээ саатсан бол тухайн нөхцөл, хуульд нийцүүлэн талууд шаардлагатай арга хэмжээ авна.") +
    p("Давагдашгүй хүчин зүйл нь хэрэглэгчийн хуульд заасан заавал эдлэх эрхийг үндэслэлгүйгээр хязгаарлахгүй."),
  ),
  sec(
    h2("19", "Нууцлал") +
    p(`Хувийн мэдээлэлтэй холбоотой асуудлыг Bondy-ийн <a href="${PRIVACY}">“Нууцлалын бодлого”</a>-оор зохицуулна.`),
  ),
  sec(
    h2("20", "Үйлчилгээний нөхцөлд өөрчлөлт оруулах") +
    quote("Энэхүү Үйлчилгээний нөхцөлд өөрчлөлт орсон тохиолдолд шинэчилсэн хувилбар болон хүчин төгөлдөр болох огноог энэ хуудсанд нийтэлнэ. Чухал өөрчлөлтийн талаар шаардлагатай тохиолдолд хэрэглэгчид мэдэгдэнэ.") +
    p("Өөрчлөлтөөс өмнө баталгаажсан захиалга, бүртгэлд тухайн үед хэрэглэгчид харуулж, зөвшөөрсөн үнэ болон буцаан олголтын нөхцөл үйлчилнэ, хуульд өөрөөр заагаагүй бол."),
  ),
  sec(
    h2("21", "Санал, гомдол ба маргаан") +
    p(`Bondy-ийн үйлчилгээтэй холбоотой санал, хүсэлт, гомдлыг эхлээд <a href="${HELP}">“Тусламжийн төв”</a>-өөр дамжуулан илгээж болно.`) +
    p("Талууд асуудлыг боломжит хэмжээнд харилцан зөвшилцөж шийдвэрлэхийг зорино.") +
    p("Шийдвэрлэх боломжгүй маргааныг Монгол Улсын хууль тогтоомжийн дагуу холбогдох эрх бүхий байгууллага эсвэл шүүхээр шийдвэрлүүлж болно."),
  ),
  sec(
    h2("22", "Холбоо барих") +
    p("Бонди Солюшнс ХХК<br />Улаанбаатар, Монгол Улс") +
    p(`Үйлчилгээтэй холбоотой хүсэлтээ Bondy-ийн <a href="${HELP}">Тусламжийн төв</a>өөр дамжуулан илгээнэ үү.`),
  ),
]);

const termsEn = page([
  sec(
    h2("Intro", "What these terms cover") +
    quote(`These Terms of Service set the basic terms of the relationship between Bondi Solutions LLC (“Bondy”) and the users and organizers who use the Bondy platform, website, and application.<br /><br />By creating an account, making a booking or registration, or using the service as an organizer, you have read and accepted these Terms of Service and the <a href="${PRIVACY}">Privacy Policy</a>.`),
  ),
  sec(
    h2("1", "Definitions") +
    defs([
      "<b>“Platform”</b> — Bondy’s website, application, and related digital services.",
      "<b>“User”</b> — a person who uses Bondy to search for, book, or register for events and courses, or to use other user services.",
      "<b>“Organizer”</b> — an individual or legal entity that publishes events or courses on Bondy and provides a service to users.",
      "<b>“Event”</b> — a performance, meeting, workshop, or other one-time activity held at a set date and time.",
      "<b>“Course”</b> — a learning service with a set start and end, delivered according to a program.",
      "<b>“Booking”</b> — the act of obtaining the right to attend an event.",
      "<b>“Registration”</b> — a confirmed right to attend a course or a free activity.",
      "<b>“Ticket”</b> — a digital ticket or QR code that confirms the right to attend that event.",
    ]),
  ),
  sec(
    h2("2", "Bondy’s role") +
    p("Bondy:") +
    list(["Provides a way to search for and view event and course information", "Provides a digital system for bookings and registrations", "Connects payment services with the relevant payment provider", "Operates digital tickets and QR check-in", "Gives organizers tools to manage their events, courses, bookings, and registrations", "Reviews information an organizer submits for publication", "Receives support requests from users and organizers"]) +
    p("Where Bondy is not itself the organizer of an event or course, the organizer is the provider of that event or course.") +
    p("Bondy’s review and publication of information does not mean Bondy guarantees the quality, safety, or outcome of the organizer’s service."),
  ),
  sec(
    h2("3", "Accounts and account security") +
    list(["Provide accurate information when you create an account.", "Do not share your password, verification code, or account details with anyone else.", "Tell Bondy immediately if you believe the account is being used without permission.", "If an event or course has an age limit, you must meet that requirement to attend.", "Where needed, the organizer may check a participant’s age, national ID, and other information the service requires."]),
  ),
  sec(
    h2("4", "Event and course information") +
    p("The organizer must keep the published information accurate and complete, including:") +
    list(["name", "description", "images and video", "date and time", "location", "price", "capacity", "age and attendance requirements", "cancellation and refund terms"]) +
    p("Bondy may refuse to publish, require a correction, or temporarily hide information that is:") +
    list(["incomplete", "misleading", "unlawful", "in breach of someone else’s rights", "a risk to safety"]) +
    p("An event or course becomes public only after it is submitted for Bondy’s review and approved."),
  ),
  sec(
    h2("5", "Bookings, registrations, and tickets") +
    h3("Paid events:") +
    list(["A booking is valid after the payment is successfully confirmed.", "The ticket appears in My bookings."]) +
    h3("Free events:") +
    list(["Registration is confirmed when there is capacity.", "A registered user may receive a QR code."]) +
    h3("Courses:") +
    list(["The user registers for the selected class.", "One registration holds one participant place in that class, unless the offer says otherwise."]) +
    p("Before booking, the user must check the date, time, location, price, and terms."),
  ),
  sec(
    h2("6", "QR tickets") +
    list(["A QR ticket is a unique code for that booking.", "You may not share, copy, or unlawfully use a QR code.", "A QR code that has already been used, is invalid, or has been cancelled cannot be used to enter.", "The user is responsible for keeping the QR code private and secure."]),
  ),
  sec(
    h2("7", "Payments") +
    list(["Payments are made through QPay, a bank, or another supported payment channel connected to Bondy.", "Before confirming payment, the user can see the total amount to be paid.", "If a payment fails or is not confirmed, the booking may not be confirmed.", "Some payment steps depend on the systems of the bank, QPay, or another payment provider.", "eBarimt and payment receipts are issued according to the applicable tax and transaction terms."]),
  ),
  sec(
    h2("8", "Refunds and cancellation") +
    p("Each event and course may have its own cancellation and refund terms.") +
    p("The user can read those terms before paying.") +
    h3("At the user’s request:") +
    list(["A request can be made when the published refund terms for that event or course allow it.", "Whether a refund is available, and the time limit, are decided by the terms that apply to that booking."]) +
    h3("If the organizer cancels:") +
    quote("If the organizer fully cancels an event or course, the payment for that booking is refunded to the user in full.") +
    h3("Material changes:") +
    quote("If the organizer makes a material change to the date, time, location, or core terms of an event or course, and the user does not accept the new terms, a refund may be requested in line with the law and those terms.") +
    p("After a refund is confirmed, Bondy starts the refund. The time it takes to reach the account may depend on the bank and the payment provider.") +
    p("After a paid booking is created, the organizer will not change the refund terms that apply to that booking in a way that is less favorable to the user."),
  ),
  sec(
    h2("9", "Organizer duties") +
    p("The organizer must:") +
    list(["Provide accurate personal and organization information", "Complete any required verification", "Organize events and courses in line with the law", "Be responsible for any required permits, licenses, copyright, and other rights", "Deliver the published schedule, capacity, price, and service terms", "Promptly tell Bondy and participants about changes, postponements, and cancellations", "Use user information only to manage that booking or registration", "Provide for user safety and an appropriate quality of service"]),
  ),
  sec(
    h2("10", "Organizer revenue, fees, and withdrawals") +
    list(["Bondy’s service fee and related charges are shown to the organizer in advance or clearly in the Organizer Portal.", "Approved fees, refunds, and related deductions may be taken from sales revenue.", "Withdrawals are made only to a confirmed payout account.", "The minimum withdrawal, processing time, and the terms then in effect are shown in the Organizer Portal.", "If there is a dispute, refund, suspicious transaction, or lawful review, payment of the related amount may be delayed for as long as needed."]),
  ),
  sec(
    h2("11", "“Featured” promotion") +
    p("“Featured” is a paid extra placement an organizer can buy.") +
    list(["The price and duration are shown to the organizer before the order is placed.", "A Featured placement does not promise a particular number of sales, views, or registrations.", "A Featured label does not mean Bondy guarantees the quality of that event or course."]),
  ),
  sec(
    h2("12", "Prohibited conduct") +
    p("The following is prohibited:") +
    list(["Publishing false or misleading information", "Deception or fraud", "Unlawful use of a QR code, booking, or registration", "Accessing someone else’s account without permission", "Intentionally interfering with the platform", "Distributing malicious code or software", "Promoting unlawful goods, services, or activities", "Infringing someone else’s copyright, trademark, or other rights", "Publishing content that discriminates, incites violence, or breaks the law"]) +
    p("If a serious breach is found, Bondy may remove the content, restrict or temporarily close the account, and take other steps the law allows."),
  ),
  sec(
    h2("13", "Intellectual property") +
    p("Bondy’s:") +
    list(["name", "logo", "design", "interface", "software", "platform structure"]) +
    p("are the intellectual property of Bondy and the relevant rights holders.") +
    p("The organizer keeps the rights in content they submit.") +
    p("The organizer grants Bondy the right to use that content to the extent needed to display, distribute, and use the event or course on the platform, in search, and in promotion.") +
    p("The organizer is responsible for having the right to use other people’s content."),
  ),
  sec(
    h2("14", "Third-party services") +
    p("Bondy may use third-party services for payments, maps, sign-in, messaging, and other functions.") +
    p("An outage or delay in that service’s systems may be outside Bondy’s direct control. Bondy will work to resolve the issue as far as it can."),
  ),
  sec(
    h2("15", "Service availability") +
    p("Bondy aims to keep the platform reliable, but the service may be temporarily unavailable because of:") +
    list(["technical updates", "maintenance", "network failures", "third-party service outages", "other conditions outside Bondy’s control"]),
  ),
  sec(
    h2("16", "Liability") +
    p("Bondy carries out the duties the law places on it in connection with its platform, payment connections, and system operation.") +
    p("The organizer is responsible for:") +
    list(["the actual organization of the event or course", "the content of the service", "permits", "safety", "the accuracy of published information", "issues arising from the organizer’s own activity"]) +
    p("These terms do not limit rights that the law of Mongolia gives users and that cannot be waived."),
  ),
  sec(
    h2("17", "Restricting or closing an account") +
    p("Bondy may take action in the following cases:") +
    list(["these terms are seriously or repeatedly breached;", "conduct indicating fraud is detected;", "platform security is put at risk; or", "the law is breached."]) +
    p("In these cases Bondy may temporarily restrict or close an account or a specific service.") +
    p(`A user may request deletion of their account through the options on the platform or through the <a href="${HELP}">Help center</a>.`),
  ),
  sec(
    h2("18", "Force majeure") +
    p("If the service is delayed by a natural disaster, a government decision, a widespread network or infrastructure failure, an attack, a quarantine, or another condition outside the parties’ reasonable control, the parties will take the steps required by those conditions and the law.") +
    p("Force majeure does not unreasonably limit rights the law gives the user and that cannot be waived."),
  ),
  sec(
    h2("19", "Privacy") +
    p(`Matters about personal information are governed by Bondy’s <a href="${PRIVACY}">Privacy Policy</a>.`),
  ),
  sec(
    h2("20", "Changes to these terms") +
    quote("If these Terms of Service change, the updated version and the date it takes effect will be published on this page. Users will be notified of important changes when necessary.") +
    p("For a booking or registration confirmed before the change, the price and refund terms shown to and accepted by the user at that time continue to apply, unless the law says otherwise."),
  ),
  sec(
    h2("21", "Feedback, complaints, and disputes") +
    p(`Feedback, requests, and complaints about Bondy’s service can first be sent through the <a href="${HELP}">Help center</a>.`) +
    p("The parties will try to resolve the matter by agreement as far as they can.") +
    p("A dispute that cannot be resolved may be taken to the competent authority or a court under the law of Mongolia."),
  ),
  sec(
    h2("22", "Contact") +
    p("Bondi Solutions LLC<br />Ulaanbaatar, Mongolia") +
    p(`Send service requests through Bondy’s <a href="${HELP}">Help center</a>.`),
  ),
]);

const settings = [
  { key: "privacy_policy", value: privacyEn, description: "Privacy Policy (English)" },
  { key: "privacy_policy_mn", value: privacyMn, description: "Privacy Policy (Mongolian)" },
  { key: "terms_conditions", value: termsEn, description: "Terms of Service (English)" },
  { key: "terms_conditions_mn", value: termsMn, description: "Terms of Service (Mongolian)" },
];

async function main() {
  if (!process.env.DB_STRING) throw new Error("DB_STRING is missing");
  await mongoose.connect(process.env.DB_STRING);
  for (const item of settings) {
    await GlobalSetting.findOneAndUpdate(
      { key: item.key },
      { $set: { value: item.value, description: item.description } },
      { upsert: true, new: true },
    );
    console.log(item.key, item.value.length);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
