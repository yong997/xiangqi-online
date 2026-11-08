/**
 * goeasy 的 package.json exports 没有正确指向自带类型声明，
 * 且 GoEasy.d.ts 只声明了静态成员；这里按运行时对象自行收窄类型。
 */
declare module 'goeasy' {
  const GoEasy: unknown
  export default GoEasy
}
