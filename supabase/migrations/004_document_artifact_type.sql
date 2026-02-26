-- Allow document file types (docx, pptx, xlsx, etc.) as artifacts
alter table sessions
  drop constraint sessions_artifact_type_check;

alter table sessions
  add constraint sessions_artifact_type_check
  check (artifact_type in ('pdf', 'image', 'document'));
