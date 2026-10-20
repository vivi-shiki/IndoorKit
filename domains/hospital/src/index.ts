/**
 * 医院业务：科室、人员与设备、两层报警规则。
 * 只依赖 IMDF 数据模型和定位数据契约，不认识地图和页面，可以在服务端或 Worker 里直接使用。
 */
export * from './alarm';
export * from './departments';
export * from './model';
export * from './rules';
