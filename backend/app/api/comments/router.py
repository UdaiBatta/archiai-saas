"""Comments pinned to the model (roadmap P6). Anyone who can open the project
can read, add and resolve them; only the author deletes one."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.mvp.router import _current_user_id
from app.database.connection import get_db
from app.models.comment import Comment
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentOut, CommentUpdate
from app.services.workspace_service import require_project_read_access
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/projects/{project_id}/comments", tags=["comments"])


def _out(comment: Comment, author: User) -> CommentOut:
    return CommentOut(
        id=comment.id,
        parent_id=comment.parent_id,
        body=comment.body,
        room_id=comment.room_id,
        x=comment.x,
        y=comment.y,
        z=comment.z,
        resolved=comment.resolved,
        created_at=comment.created_at,
        author_id=author.id,
        author_name=author.name,
    )


async def _comment(db: AsyncSession, project_id: str, comment_id: str) -> Comment:
    comment = await db.get(Comment, comment_id)
    if comment is None or comment.project_id != project_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.get("", response_model=list[CommentOut])
async def list_comments(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[CommentOut]:
    await require_project_read_access(db, project_id, user_id)
    rows = await db.execute(
        select(Comment, User)
        .join(User, User.id == Comment.user_id)
        .where(Comment.project_id == project_id)
        .order_by(Comment.created_at, Comment.id)
    )
    return [_out(comment, author) for comment, author in rows.all()]


@router.post(
    "",
    response_model=CommentOut,
    status_code=201,
    dependencies=[Depends(rate_limit("comment_create", limit=60, window_seconds=60))],
)
async def create_comment(
    project_id: str,
    request: CommentCreate,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> CommentOut:
    await require_project_read_access(db, project_id, user_id)
    if request.parent_id is not None:
        parent = await _comment(db, project_id, request.parent_id)
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="Reply to the thread's first comment")
    comment = Comment(project_id=project_id, user_id=user_id, **request.model_dump())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _out(comment, await db.get(User, user_id))


@router.patch("/{comment_id}", response_model=CommentOut)
async def update_comment(
    project_id: str,
    comment_id: str,
    request: CommentUpdate,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> CommentOut:
    await require_project_read_access(db, project_id, user_id)
    comment = await _comment(db, project_id, comment_id)
    comment.resolved = request.resolved
    await db.commit()
    await db.refresh(comment)
    return _out(comment, await db.get(User, comment.user_id))


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    project_id: str,
    comment_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_project_read_access(db, project_id, user_id)
    comment = await _comment(db, project_id, comment_id)
    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the author can delete a comment")
    await db.delete(comment)
    await db.commit()
